const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sql = require('mssql');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use('/images', express.static('uploads'));

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database Configuration
const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'rfx14w',
  server: process.env.DB_HOST,
  database: process.env.DB_NAME || 'imahe_db',
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

let dbPool = null;
if (process.env.DB_HOST) {
  (async () => {
    try {
      const masterConfig = { ...dbConfig, database: 'master' };
      const targetDbName = dbConfig.database;
      
      let masterPool = await sql.connect(masterConfig);
      console.log('Connected to SQL Server master database at ' + process.env.DB_HOST);
      
      const dbCheckResult = await masterPool.request().query(`
        SELECT database_id FROM sys.databases WHERE Name = '${targetDbName}'
      `);
      
      if (dbCheckResult.recordset.length === 0) {
        console.log(`Database '${targetDbName}' does not exist. Creating...`);
        await masterPool.request().query(`CREATE DATABASE [${targetDbName}]`);
      }
      await masterPool.close();

      dbPool = await sql.connect(dbConfig);
      console.log(`Connected to target database '${targetDbName}'`);

      await dbPool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmployeeProfiles' and xtype='U')
        CREATE TABLE EmployeeProfiles (
            EmployeeName NVARCHAR(255) PRIMARY KEY,
            JobTitle NVARCHAR(255),
            Email NVARCHAR(255)
        );
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='EmployeeImages' and xtype='U')
        CREATE TABLE EmployeeImages (
            Id INT IDENTITY(1,1) PRIMARY KEY,
            EmployeeName NVARCHAR(255),
            FileName NVARCHAR(500),
            FilePath NVARCHAR(1000)
        );
      `);
    } catch (err) {
      console.error('Database connection or creation failed. Falling back to local file system profiles.', err);
    }
  })();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const employeeName = req.body.employeeName || 'Uncategorized';
    // Validate folder name (prevent directory traversal)
    const safeEmployeeName = path.basename(employeeName);
    const dir = path.join(uploadsDir, safeEmployeeName);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.get('/api/images', async (req, res) => {
  if (!fs.existsSync(uploadsDir)) {
    return res.json([]);
  }

  const images = [];
  const profiles = {};

  if (dbPool) {
    try {
      const result = await dbPool.request().query('SELECT * FROM EmployeeProfiles');
      result.recordset.forEach(record => {
        profiles[record.EmployeeName] = { jobTitle: record.JobTitle, email: record.Email };
      });
    } catch (err) {
      console.error('Error fetching profiles from DB', err);
    }
  }

  const folders = fs.readdirSync(uploadsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const folder of folders) {
    const folderPath = path.join(uploadsDir, folder);
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (file === 'profile.json') {
        if (!dbPool) {
          try {
            profiles[folder] = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
          } catch (e) { }
        }
        continue;
      }
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
        images.push({
          id: file,
          name: file, // File name acts as the display name for the image
          folder: folder,
          url: `/images/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`,
          downloadUrl: `/api/download/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`
        });
      }
    }
  }

  res.json({ images, profiles });
});

app.post('/api/upload', upload.array('images', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const employeeName = path.basename(req.body.employeeName || 'Uncategorized');
  const jobTitle = req.body.jobTitle || '';
  const email = req.body.email || '';

  if (jobTitle || email) {
    if (dbPool) {
      try {
        await dbPool.request()
          .input('EmployeeName', sql.NVarChar, employeeName)
          .input('JobTitle', sql.NVarChar, jobTitle)
          .input('Email', sql.NVarChar, email)
          .query(`
            IF EXISTS (SELECT * FROM EmployeeProfiles WHERE EmployeeName = @EmployeeName)
              UPDATE EmployeeProfiles SET JobTitle = COALESCE(NULLIF(@JobTitle, ''), JobTitle), Email = COALESCE(NULLIF(@Email, ''), Email) WHERE EmployeeName = @EmployeeName
            ELSE
              INSERT INTO EmployeeProfiles (EmployeeName, JobTitle, Email) VALUES (@EmployeeName, @JobTitle, @Email)
          `);
      } catch (err) {
        console.error('Error saving profile to DB', err);
      }
    } else {
      const folderPath = path.join(uploadsDir, employeeName);
      const profilePath = path.join(folderPath, 'profile.json');
      let profile = {};
      if (fs.existsSync(profilePath)) {
        try {
          profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        } catch (e) { }
      }
      if (jobTitle) profile.jobTitle = jobTitle;
      if (email) profile.email = email;
      fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
    }
  }

  const filesInfo = req.files.map(file => ({
    id: file.filename,
    name: file.filename,
    folder: employeeName,
    url: `/images/${encodeURIComponent(employeeName)}/${encodeURIComponent(file.filename)}`,
    downloadUrl: `/api/download/${encodeURIComponent(employeeName)}/${encodeURIComponent(file.filename)}`
  }));

  if (dbPool && filesInfo.length > 0) {
    try {
      for (const file of filesInfo) {
        await dbPool.request()
          .input('EmployeeName', sql.NVarChar, employeeName)
          .input('FileName', sql.NVarChar, file.name)
          .input('FilePath', sql.NVarChar, file.url)
          .query('INSERT INTO EmployeeImages (EmployeeName, FileName, FilePath) VALUES (@EmployeeName, @FileName, @FilePath)');
      }
    } catch (err) {
      console.error('Error saving images to DB', err);
    }
  }

  res.json({
    message: 'Files uploaded successfully',
    files: filesInfo
  });
});

app.get('/api/download/:folder/:filename', (req, res) => {
  const folder = path.basename(req.params.folder);
  const filename = path.basename(req.params.filename);
  const file = path.join(uploadsDir, folder, filename);
  res.download(file, (err) => {
    if (err) {
      console.error('Error downloading file:', err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File not found' });
      }
    }
  });
});

app.delete('/api/images/:folder/:filename', async (req, res) => {
  const folder = path.basename(req.params.folder);
  const filename = path.basename(req.params.filename);
  const folderPath = path.join(uploadsDir, folder);
  const filePath = path.join(folderPath, filename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);

      // Delete folder if empty or only contains profile.json
      const remainingFiles = fs.readdirSync(folderPath);
      if (remainingFiles.length === 0 || (remainingFiles.length === 1 && remainingFiles[0] === 'profile.json')) {
        fs.rmSync(folderPath, { recursive: true, force: true });
      }

      if (dbPool) {
        try {
          await dbPool.request()
            .input('EmployeeName', sql.NVarChar, folder)
            .input('FileName', sql.NVarChar, filename)
            .query('DELETE FROM EmployeeImages WHERE EmployeeName = @EmployeeName AND FileName = @FileName');
        } catch (err) {
          console.error('Error deleting image from DB', err);
        }
      }

      res.json({ message: 'File deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Error deleting file' });
    }
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.delete('/api/folders/:folder', async (req, res) => {
  const folder = path.basename(req.params.folder);
  const folderPath = path.join(uploadsDir, folder);

  let deletedFromDisk = false;
  if (fs.existsSync(folderPath)) {
    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
      deletedFromDisk = true;
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error deleting folder from disk' });
    }
  }

  let deletedFromDb = false;
  if (dbPool) {
    try {
      await dbPool.request()
        .input('EmployeeName', sql.NVarChar, folder)
        .query('DELETE FROM EmployeeImages WHERE EmployeeName = @EmployeeName');
      await dbPool.request()
        .input('EmployeeName', sql.NVarChar, folder)
        .query('DELETE FROM EmployeeProfiles WHERE EmployeeName = @EmployeeName');
      deletedFromDb = true;
    } catch (err) {
      console.error('Error deleting profile from DB', err);
    }
  }

  if (!deletedFromDisk && !deletedFromDb && !dbPool) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  res.json({ message: 'Folder deleted successfully' });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
