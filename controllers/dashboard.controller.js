// Dashboard Controller
const User = require('../models/user.model');
const File = require('../models/file.model');

const formatStorage = (bytes) => {
  if (bytes < 1024) return { storageUsed: bytes.toFixed(2), storageUnit: 'B' };
  if (bytes < 1024 * 1024) return { storageUsed: (bytes / 1024).toFixed(2), storageUnit: 'KB' };
  if (bytes < 1024 * 1024 * 1024) return { storageUsed: (bytes / (1024 * 1024)).toFixed(2), storageUnit: 'MB' };
  return { storageUsed: (bytes / (1024 * 1024 * 1024)).toFixed(2), storageUnit: 'GB' };
};

// Get dashboard page
const getDashboard = async (req, res, next) => {
  try {
    // Fetch user data from database using user ID from JWT token
    const user = await User.findById(req.user.id).select('-password');
    
    if (!user) {
      return res.status(404).render('errors/error', {
        title: 'User Not Found',
        status: 404,
        message: 'User profile not found'
      });
    }

    // Fetch user's files for recent files section (top 10)
    const files = await File.find({ userId: req.user.id, isDeleted: false })
      .sort({ uploadedAt: -1 })
      .limit(10)
      .lean();

    // Fetch files shared with the user
    const sharedFiles = await File.find({ sharedWith: req.user.id, isDeleted: false })
      .sort({ uploadedAt: -1 })
      .limit(10)
      .populate('userId', 'username firstName lastName')
      .lean();
    
    // Calculate storage stats
    const allFiles = await File.find({ userId: req.user.id, isDeleted: false })
      .lean();
    const totalSize = allFiles.reduce((sum, file) => sum + file.fileSize, 0);
    const { storageUsed, storageUnit } = formatStorage(totalSize);

    // Group stored bytes by broad file type for the dashboard breakdown
    const typeOf = (f) => {
      const mime = String(f.mimeType || '');
      const ext = String(f.originalName || '').split('.').pop().toLowerCase();
      if (mime.startsWith('image/')) return 'image';
      if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'media';
      if (mime.includes('pdf') || mime.startsWith('text/') || ['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'md'].includes(ext)) return 'doc';
      return 'other';
    };
    const typeMeta = {
      image: { label: 'Images', color: 'bg-amber' },
      doc: { label: 'Documents', color: 'bg-forest' },
      media: { label: 'Video & audio', color: 'bg-slate' },
      other: { label: 'Other', color: 'bg-faint' }
    };
    const byType = Object.entries(allFiles.reduce((acc, f) => {
      const k = typeOf(f);
      acc[k] = acc[k] || { bytes: 0, count: 0 };
      acc[k].bytes += f.fileSize || 0;
      acc[k].count += 1;
      return acc;
    }, {}))
      .map(([k, v]) => ({ key: k, ...typeMeta[k], ...v }))
      .sort((a, b) => b.bytes - a.bytes);

    res.render('pages/dashboard', { 
      title: "Dashboard · MyDrive", 
      isLoggedIn: true,
      user: user,
      files: files,
      sharedFiles,
      fileCount: allFiles.length,
      storageUsed: storageUsed,
      storageUnit: storageUnit,
      storageBytes: totalSize,
      byType
    });
  } catch (err) {
    console.error("Error fetching dashboard:", err);
    return next(err);
  }
};

module.exports = {
  getDashboard
};
