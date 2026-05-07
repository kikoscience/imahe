const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const employeeName = req.body.employeeName || 'Uncategorized';
    // Validate folder name (prevent directory traversal)
    const safeEmployeeName = path.basename(employeeName);
    const dir = path.join(uploadsDir, safeEmployeeName);
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

app.get('/api/images', (req, res) => {
  if (!fs.existsSync(uploadsDir)) {
    return res.json([]);
  }

  const images = [];
  const profiles = {};
  const folders = fs.readdirSync(uploadsDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  for (const folder of folders) {
    const folderPath = path.join(uploadsDir, folder);
    const files = fs.readdirSync(folderPath);
    for (const file of files) {
      if (file === 'profile.json') {
        try {
          profiles[folder] = JSON.parse(fs.readFileSync(path.join(folderPath, file), 'utf8'));
        } catch (e) {}
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

app.post('/api/upload', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const employeeName = path.basename(req.body.employeeName || 'Uncategorized');
  const jobTitle = req.body.jobTitle || '';
  const email = req.body.email || '';
  
  if (jobTitle || email) {
    const folderPath = path.join(uploadsDir, employeeName);
    const profilePath = path.join(folderPath, 'profile.json');
    let profile = {};
    if (fs.existsSync(profilePath)) {
      try {
        profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      } catch(e){}
    }
    if (jobTitle) profile.jobTitle = jobTitle;
    if (email) profile.email = email;
    fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
  }
  
  const filesInfo = req.files.map(file => ({
    id: file.filename,
    name: file.filename,
    folder: employeeName,
    url: `/images/${encodeURIComponent(employeeName)}/${encodeURIComponent(file.filename)}`,
    downloadUrl: `/api/download/${encodeURIComponent(employeeName)}/${encodeURIComponent(file.filename)}`
  }));

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

app.delete('/api/images/:folder/:filename', (req, res) => {
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

      res.json({ message: 'File deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Error deleting file' });
    }
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.delete('/api/folders/:folder', (req, res) => {
  const folder = path.basename(req.params.folder);
  const folderPath = path.join(uploadsDir, folder);

  if (fs.existsSync(folderPath)) {
    try {
      fs.rmSync(folderPath, { recursive: true, force: true });
      res.json({ message: 'Folder deleted successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Error deleting folder' });
    }
  } else {
    res.status(404).json({ error: 'Folder not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
