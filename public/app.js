document.addEventListener('DOMContentLoaded', () => {
  const gallery = document.getElementById('gallery');
  const searchInput = document.getElementById('searchInput');
  const breadcrumbs = document.getElementById('breadcrumbs');
  
  const uploadBtn = document.getElementById('uploadBtn');
  const uploadModal = document.getElementById('uploadModal');
  const closeBtn = document.querySelector('.close-btn');
  
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const uploadForm = document.getElementById('uploadForm');
  const filePreview = document.getElementById('filePreview');
  const previewGrid = document.getElementById('previewGrid');
  const fileNameDisplay = document.getElementById('fileName');
  const removeFileBtn = document.getElementById('removeFile');
  const submitUpload = document.getElementById('submitUpload');
  
  const viewerModal = document.getElementById('viewerModal');
  const viewerImage = document.getElementById('viewerImage');
  const closeViewerBtn = document.getElementById('closeViewerBtn');

  let images = [];
  let profiles = {};
  let currentFiles = [];
  let currentPath = 'home'; // 'home' or folder name

  // Theme Toggle Logic
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeIcon');
  
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeIcon.classList.replace('fa-sun', 'fa-moon');
  }

  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'dark');
      themeIcon.classList.replace('fa-moon', 'fa-sun');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('theme', 'light');
      themeIcon.classList.replace('fa-sun', 'fa-moon');
    }
  });

  // Load images from the server
  async function loadImages() {
    try {
      const res = await fetch('/api/images');
      if (!res.ok) throw new Error('Failed to fetch images');
      const data = await res.json();
      images = data.images || [];
      profiles = data.profiles || {};
      renderView();
    } catch (err) {
      console.error(err);
      gallery.innerHTML = '<div class="empty-state">Failed to load images. Please try again later.</div>';
    }
  }

  function renderView() {
    renderBreadcrumbs();
    
    const term = searchInput.value.toLowerCase();
    const filteredImages = images.filter(img => img.name.toLowerCase().includes(term));

    if (currentPath === 'home') {
      renderFolders(filteredImages);
    } else {
      renderFolderContents(filteredImages.filter(img => img.folder === currentPath));
    }
  }

  function renderBreadcrumbs() {
    if (currentPath === 'home') {
      breadcrumbs.innerHTML = `<span class="crumb active" data-path="home">Home</span>`;
    } else {
      breadcrumbs.innerHTML = `
        <span class="crumb" data-path="home">Home</span>
        <span class="crumb-separator"><i class="fa-solid fa-chevron-right"></i></span>
        <span class="crumb active">${currentPath}</span>
      `;
    }

    breadcrumbs.querySelectorAll('.crumb').forEach(crumb => {
      crumb.addEventListener('click', (e) => {
        const path = e.currentTarget.dataset.path;
        if (path) {
          currentPath = path;
          renderView();
        }
      });
    });
  }

  function renderFolders(imgs) {
    const folders = [...new Set(imgs.map(img => img.folder || 'Uncategorized'))];
    
    if (folders.length === 0) {
      gallery.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-folder-open icon-large" style="margin-bottom: 1rem;"></i>
          <h3>No folders found</h3>
          <p>Upload some employee images to get started.</p>
        </div>`;
      return;
    }

    gallery.innerHTML = folders.map(folder => `
      <div class="folder-card" data-folder="${folder}">
        <i class="fa-solid fa-folder folder-icon"></i>
        <span class="folder-name">${folder}</span>
        <button class="folder-delete-btn" data-folder="${folder}" title="Delete Folder"><i class="fa-solid fa-trash"></i></button>
      </div>
    `).join('');

    document.querySelectorAll('.folder-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation(); // Prevent folder from opening
        const folder = e.currentTarget.dataset.folder;
        if (confirm(`Are you sure you want to delete the entire folder for ${folder}? This cannot be undone.`)) {
          try {
            const res = await fetch(`/api/folders/${encodeURIComponent(folder)}`, { method: 'DELETE' });
            if (res.ok) {
              loadImages();
            } else {
              alert('Failed to delete folder.');
            }
          } catch (err) {
            console.error(err);
            alert('Error deleting folder.');
          }
        }
      });
    });

    document.querySelectorAll('.folder-card').forEach(card => {
      card.addEventListener('click', (e) => {
        currentPath = e.currentTarget.dataset.folder;
        renderView();
      });
    });
  }

  function renderFolderContents(imgs) {
    let headerHtml = '';
    const profile = profiles[currentPath];
    if (profile && (profile.jobTitle || profile.email)) {
      headerHtml = `
        <div class="profile-header">
          <h2>${currentPath}</h2>
          <div class="profile-meta">
            ${profile.jobTitle ? `<div><i class="fa-solid fa-briefcase"></i> ${profile.jobTitle}</div>` : ''}
            ${profile.email ? `<div><i class="fa-solid fa-envelope"></i> ${profile.email}</div>` : ''}
          </div>
        </div>
      `;
    }

    if (imgs.length === 0) {
      gallery.innerHTML = headerHtml + `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <i class="fa-solid fa-image icon-large" style="margin-bottom: 1rem;"></i>
          <h3>No images found</h3>
          <p>This folder is empty.</p>
        </div>`;
      return;
    }

    gallery.innerHTML = headerHtml + imgs.map(img => `
      <div class="image-card" data-url="${img.url}">
        <div class="image-wrapper">
          <img src="${img.url}" alt="${img.name}" loading="lazy">
        </div>
        <div class="image-overlay">
          <div class="image-info">
            <span class="image-name" title="${img.name}">${img.name}</span>
            <div style="display:flex; gap:0.25rem;">
              <a href="${img.downloadUrl}" download class="btn-icon" title="Download">
                <i class="fa-solid fa-download"></i>
              </a>
              <button class="btn-icon btn-danger delete-btn" data-id="${img.id}" data-folder="${img.folder}" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    // Attach delete listeners
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const folder = e.currentTarget.dataset.folder;
        if (confirm('Are you sure you want to delete this image?')) {
          try {
            const res = await fetch(`/api/images/${encodeURIComponent(folder)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (res.ok) {
              loadImages();
            } else {
              alert('Failed to delete image.');
            }
          } catch (err) {
            console.error(err);
            alert('Error deleting image.');
          }
        }
      });
    });

    // Image Viewer logic
    document.querySelectorAll('.image-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent opening if clicked on buttons or links inside the card
        if (e.target.closest('button') || e.target.closest('a')) return;
        
        const imgUrl = card.dataset.url;
        if (imgUrl) {
          viewerImage.src = imgUrl;
          viewerModal.classList.remove('hidden');
        }
      });
    });
  }

  // Viewer Modal Handlers
  closeViewerBtn.addEventListener('click', () => {
    viewerModal.classList.add('hidden');
    setTimeout(() => { viewerImage.src = ''; }, 300); // Clear after fade out
  });

  viewerModal.addEventListener('click', (e) => {
    if (e.target === viewerModal || e.target.closest('.viewer-content') === null || e.target === viewerImage) {
      viewerModal.classList.add('hidden');
      setTimeout(() => { viewerImage.src = ''; }, 300);
    }
  });

  // Search functionality
  searchInput.addEventListener('input', () => {
    renderView();
  });

  // Modal Handlers
  uploadBtn.addEventListener('click', () => {
    uploadModal.classList.remove('hidden');
    // Pre-fill employee name if we are inside a folder
    if (currentPath !== 'home') {
      document.getElementById('employeeName').value = currentPath;
    }
  });

  const closeModal = () => {
    uploadModal.classList.add('hidden');
    resetUploadForm();
  };

  closeBtn.addEventListener('click', closeModal);
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeModal();
  });

  // Drag and Drop Handlers
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    handleFiles(dt.files);
  });

  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', function() {
    handleFiles(this.files);
  });

  function handleFiles(files) {
    const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    
    if (validFiles.length === 0) {
      alert('Please upload image files only.');
      return;
    }

    currentFiles = [...currentFiles, ...validFiles];
    updatePreview();
  }

  function updatePreview() {
    if (currentFiles.length === 0) {
      resetUploadForm();
      return;
    }

    fileNameDisplay.textContent = `${currentFiles.length} file(s) selected`;
    
    previewGrid.innerHTML = '';
    currentFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.className = 'preview-item';
        previewGrid.appendChild(img);
      };
      reader.readAsDataURL(file);
    });

    dropZone.classList.add('hidden');
    filePreview.classList.remove('hidden');
    submitUpload.disabled = false;
  }

  removeFileBtn.addEventListener('click', resetUploadForm);

  function resetUploadForm() {
    currentFiles = [];
    fileInput.value = '';
    document.getElementById('employeeName').value = '';
    document.getElementById('jobTitle').value = '';
    document.getElementById('email').value = '';
    previewGrid.innerHTML = '';
    dropZone.classList.remove('hidden');
    filePreview.classList.add('hidden');
    submitUpload.disabled = true;
  }

  // Upload Form Submit
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentFiles.length === 0) return;

    const formData = new FormData();
    // IMPORTANT: Append text fields before files so multer can read them during file processing!
    formData.append('employeeName', document.getElementById('employeeName').value);
    formData.append('jobTitle', document.getElementById('jobTitle').value);
    formData.append('email', document.getElementById('email').value);
    currentFiles.forEach(file => {
      formData.append('images', file);
    });

    const originalText = submitUpload.innerHTML;
    submitUpload.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...';
    submitUpload.disabled = true;

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');
      
      closeModal();
      loadImages(); // Reload the gallery
    } catch (err) {
      console.error(err);
      alert('Failed to upload image. Please try again.');
      submitUpload.innerHTML = originalText;
      submitUpload.disabled = false;
    }
  });

  // Initial load
  loadImages();
});
