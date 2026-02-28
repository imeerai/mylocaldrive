const File = require('../models/file.model');
const User = require('../models/user.model');
const fs = require('fs');
const mongoose = require('mongoose');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');
const {
	MAX_FILE_SIZE,
	USER_QUOTA,
	GLOBAL_QUOTA,
	BUCKET,
	LOCAL_FALLBACK_ENABLED,
	isNetworkTimeoutError,
	cleanupTempUploads,
	formatStorage,
	buildObjectKey,
	aggregateUsage,
	canAccessFile,
	storageReady,
} = require('./file.storage-utils');

async function getFiles(req, res, next) {
	try {
		const { sort = 'date', page = 1, limit = 10 } = req.query;
		const pageNum = Math.max(1, parseInt(page) || 1);
		const pageLimit = Math.min(50, Math.max(5, parseInt(limit) || 10));
		const skip = (pageNum - 1) * pageLimit;

		// Build sort object based on query parameter
		let sortObj = { uploadedAt: -1 }; // default: newest first
		if (sort === 'name') sortObj = { originalName: 1 };
		else if (sort === 'size') sortObj = { fileSize: -1 };
		else if (sort === 'oldest') sortObj = { uploadedAt: 1 };

		const [files, trashedFiles, user, totalFiles] = await Promise.all([
			File.find({ userId: req.user.id, isDeleted: false })
				.sort(sortObj)
				.skip(skip)
				.limit(pageLimit)
				.lean(),
			File.find({ userId: req.user.id, isDeleted: true })
				.sort({ deletedAt: -1 })
				.lean(),
			User.findById(req.user.id).select('-password'),
			File.countDocuments({ userId: req.user.id, isDeleted: false })
		]);

		const totalSize = files.reduce((sum, file) => sum + file.fileSize, 0);
		const { storageUsed, storageUnit } = formatStorage(totalSize);
		const totalPages = Math.ceil(totalFiles / pageLimit);

		res.render('pages/files', {
			title: 'My Files',
			files,
			trashedFiles,
			storageUsed,
			storageUnit,
			storageBytes: totalSize,
			fileCount: files.length,
			user,
			pagination: {
				currentPage: pageNum,
				totalPages,
				totalFiles,
				pageLimit,
				hasNextPage: pageNum < totalPages,
				hasPrevPage: pageNum > 1
			},
			currentSort: sort
		});
	} catch (err) {
		console.error('Error fetching files:', err);
		next(err);
	}
}

async function uploadMultipleFiles(req, res, next) {
	try {
		if (!storageReady()) {
			return res.status(500).json({ error: 'Cloud storage is not configured. Please set R2 env vars.' });
		}

		if (!req.files || req.files.length === 0) {
			return res.status(400).json({ error: 'No files uploaded' });
		}

		const oversized = req.files.find((file) => file.size > MAX_FILE_SIZE);
		if (oversized) {
			return res.status(400).json({ error: `${oversized.originalname} exceeds the 500 MB file limit` });
		}

		const incomingTotal = req.files.reduce((sum, file) => sum + (file.size || 0), 0);
		const userUsage = await aggregateUsage({ userId: new mongoose.Types.ObjectId(req.user.id), isDeleted: false });
		const globalUsage = await aggregateUsage({ isDeleted: false });

		if (userUsage + incomingTotal > USER_QUOTA) {
			const remaining = Math.max(USER_QUOTA - userUsage, 0);
			return res.status(400).json({ error: `Upload exceeds your 500 MB limit. Remaining: ${(remaining / (1024 * 1024)).toFixed(2)} MB` });
		}

		if (globalUsage + incomingTotal > GLOBAL_QUOTA) {
			const remaining = Math.max(GLOBAL_QUOTA - globalUsage, 0);
			return res.status(400).json({ error: `Upload exceeds the platform 9 GB cap. Remaining: ${(remaining / (1024 * 1024 * 1024)).toFixed(2)} GB` });
		}

		const uploadedFiles = [];
		const retainedLocalPaths = new Set();
		let usedLocalFallback = false;

		for (const file of req.files) {
			const key = buildObjectKey(req.user, file.originalname);
			let storedInR2 = true;

			try {
				await r2.send(new PutObjectCommand({
					Bucket: BUCKET,
					Key: key,
					Body: fs.createReadStream(file.path),
					ContentType: file.mimetype,
					ContentLength: file.size
				}));
			} catch (storageErr) {
				if (LOCAL_FALLBACK_ENABLED && isNetworkTimeoutError(storageErr)) {
					storedInR2 = false;
					usedLocalFallback = true;
					console.warn(`[UPLOAD] R2 timeout, using local fallback for: ${file.originalname}`);
				} else {
					throw storageErr;
				}
			}

			const newFile = new File({
				userId: req.user.id,
				fileName: file.filename,
				originalName: file.originalname,
				mimeType: file.mimetype,
				fileSize: file.size,
				filePath: storedInR2 ? null : file.path,
				r2Key: storedInR2 ? key : null,
				bucket: storedInR2 ? BUCKET : null,
				isDeleted: false
			});

			await newFile.save();
			uploadedFiles.push(newFile);
			if (!storedInR2 && file.path) retainedLocalPaths.add(file.path);

			if (storedInR2 && file.path && fs.existsSync(file.path)) {
				fs.unlinkSync(file.path);
			}
		}

		res.json({
			success: true,
			message: usedLocalFallback
				? `${uploadedFiles.length} file(s) uploaded successfully (temporary local storage mode)`
				: `${uploadedFiles.length} file(s) uploaded successfully`,
			storageMode: usedLocalFallback ? 'local-fallback' : 'r2',
			files: uploadedFiles
		});
	} catch (err) {
		console.error('Error uploading files:', err);
		if (isNetworkTimeoutError(err)) {
			cleanupTempUploads(req.files);
			return res.status(503).json({
				error: 'Cloud storage timeout. Please retry in a few moments.'
			});
		}
		cleanupTempUploads(req.files, retainedLocalPaths);
		next(err);
	}
}

async function downloadFile(req, res, next) {
	try {
		const fileId = req.params.fileId;
		const userId = req.user.id;
		
		const file = await File.findById(fileId);

		if (!file || file.isDeleted) {
			console.error(`[DOWNLOAD] File not found - ID: ${fileId}`);
			return res.status(404).json({ error: 'File not found' });
		}

		if (!canAccessFile(file, userId)) {
			console.error(`[DOWNLOAD] Access denied - User: ${userId}, File Owner: ${file.userId}`);
			return res.status(403).json({ error: 'You do not have access to download this file' });
		}

		if (!file.r2Key) {
			if (file.filePath && fs.existsSync(file.filePath)) {
				return res.download(file.filePath, file.originalName);
			}
			console.error(`[DOWNLOAD] File missing - r2Key not set for ${fileId}`);
			return res.status(404).json({ error: 'File missing from storage' });
		}

		const bucket = file.bucket || BUCKET;

		try {
			const result = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: file.r2Key }));
			res.setHeader('Content-Type', file.mimeType || result.ContentType || 'application/octet-stream');
			if (result.ContentLength) res.setHeader('Content-Length', result.ContentLength);
			res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
			result.Body.pipe(res);
		} catch (storageErr) {
			console.error(`[DOWNLOAD] R2 Error:`, storageErr.message);
			if (storageErr?.$metadata?.httpStatusCode === 404) {
				return res.status(404).json({ error: 'File missing from storage' });
			}
			throw storageErr;
		}
	} catch (err) {
		console.error('Error downloading file:', err);
		next(err);
	}
}

async function deleteFile(req, res, next) {
	try {
		const file = await File.findOne({ _id: req.params.fileId, userId: req.user.id });

		if (!file) {
			return res.status(404).json({ error: 'File not found' });
		}

		if (file.isDeleted) {
			return res.status(400).json({ error: 'File is already in recycle bin' });
		}

		file.isDeleted = true;
		file.deletedAt = new Date();
		file.deletedBy = req.user.id;
		file.sharedWith = []; // Remove from all shares
		await file.save();

		res.json({ success: true, message: 'File moved to Recycle Bin' });
	} catch (err) {
		console.error('Error moving file to recycle bin:', err);
		next(err);
	}
}

async function restoreFile(req, res, next) {
	try {
		const file = await File.findOne({ _id: req.params.fileId, userId: req.user.id, isDeleted: true });

		if (!file) {
			return res.status(404).json({ error: 'File not found in recycle bin' });
		}

		file.isDeleted = false;
		file.deletedAt = null;
		file.deletedBy = null;
		await file.save();

		res.json({ success: true, message: 'File restored successfully' });
	} catch (err) {
		console.error('Error restoring file:', err);
		next(err);
	}
}

async function deleteForever(req, res, next) {
	try {
		const file = await File.findOne({ _id: req.params.fileId, userId: req.user.id, isDeleted: true });

		if (!file) {
			return res.status(404).json({ error: 'File not found in recycle bin' });
		}

		// Delete from R2 storage
		if (!file.r2Key) {
			if (file.filePath && fs.existsSync(file.filePath)) {
				fs.unlinkSync(file.filePath);
			}
		} else {
			const bucket = file.bucket || BUCKET;

			try {
				await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: file.r2Key }));
			} catch (storageErr) {
				console.warn('Storage delete warning:', storageErr.message);
			}
		}

		// Clear shares before deletion
		file.sharedWith = [];
		await file.save();

		// Delete from database
		await file.deleteOne();

		res.json({ success: true, message: 'File permanently deleted' });
	} catch (err) {
		console.error('Error permanently deleting file:', err);
		next(err);
	}
}

async function renameFile(req, res, next) {
	try {
		const { newName } = req.body;

		if (!newName || newName.trim() === '') {
			return res.status(400).json({ error: 'New name is required' });
		}

		const file = await File.findOne({ _id: req.params.fileId, userId: req.user.id, isDeleted: false });

		if (!file) {
			return res.status(404).json({ error: 'File not found' });
		}

		file.originalName = newName;
		await file.save();

		res.json({ success: true, message: 'File renamed successfully', file });
	} catch (err) {
		console.error('Error renaming file:', err);
		next(err);
	}
}

async function shareFile(req, res, next) {
	try {
		const { sharedWithUsername } = req.body;

		if (!sharedWithUsername) {
			return res.status(400).json({ error: 'Username is required' });
		}

		const file = await File.findById(req.params.fileId);

		if (!file || file.isDeleted) {
			return res.status(404).json({ error: 'File not found' });
		}

		if (!canAccessFile(file, req.user.id)) {
			return res.status(403).json({ error: 'You do not have permission to share this file' });
		}

		const sharedWithUser = await User.findOne({ username: sharedWithUsername });

		if (!sharedWithUser) {
			return res.status(404).json({ error: 'User not found' });
		}

		if (String(sharedWithUser._id) === String(req.user.id)) {
			return res.status(400).json({ error: 'You cannot share a file with yourself' });
		}

		const alreadyShared = file.sharedWith?.some((id) => String(id) === String(sharedWithUser._id));
		if (!alreadyShared) {
			file.sharedWith.push(sharedWithUser._id);
			file.isShared = true;
			await file.save();
		}

		res.json({ success: true, message: 'File shared successfully', file });
	} catch (err) {
		console.error('Error sharing file:', err);
		next(err);
	}
}

async function generateShareLink(req, res, next) {
	try {
		const file = await File.findById(req.params.fileId);

		if (!file || file.isDeleted) {
			return res.status(404).json({ success: false, error: 'File not found' });
		}

		if (!canAccessFile(file, req.user.id)) {
			return res.status(403).json({ success: false, error: 'You do not have permission to share this file' });
		}

		// Generate unique share code if not already exists
		if (!file.shareCode) {
			let shareCode;
			let exists = true;
			
			// Generate unique code
			while (exists) {
				shareCode = Math.random().toString(36).substring(2, 8);
				exists = await File.findOne({ shareCode });
			}
			
			file.shareCode = shareCode;
			file.shareCodeCreatedAt = new Date();
			await file.save();
		}

		// Build the share link (use request host)
		const protocol = req.protocol;
		const host = req.get('host');
		const shareLink = `${protocol}://${host}/share/${file.shareCode}`;

		res.json({ success: true, shareLink });
	} catch (err) {
		console.error('Error generating share link:', err);
		res.status(500).json({ success: false, error: 'Failed to generate share link' });
	}
}

async function accessSharedFile(req, res, next) {
	try {
		const { shareCode } = req.params;

		const file = await File.findOne({ shareCode, isDeleted: false }).populate('userId');

		if (!file) {
			return res.status(404).render('errors/error', { 
				title: 'File Not Found',
				status: 404,
				message: 'This file does not exist or has been deleted'
			});
		}

		// Stream the file from R2 with inline disposition
		if (!storageReady()) {
			return res.status(500).render('errors/error', { 
				title: 'Error',
				status: 500,
				message: 'File storage is not configured'
			});
		}

		try {
			const command = new GetObjectCommand({
				Bucket: BUCKET,
				Key: file.r2Key
			});
			const response = await r2.send(command);

			// Set headers for viewing inline (not download)
			res.setHeader('Content-Type', file.mimeType || response.ContentType || 'application/octet-stream');
			if (response.ContentLength) res.setHeader('Content-Length', response.ContentLength);
			res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);

			// Stream the file
			response.Body.pipe(res);
		} catch (err) {
			console.error('Error retrieving file from R2:', err);
			res.status(500).render('errors/error', { 
				title: 'Error',
				status: 500,
				message: 'Failed to retrieve file from storage'
			});
		}
	} catch (err) {
		console.error('Error accessing shared file:', err);
		res.status(500).render('errors/error', { 
			title: 'Error',
			status: 500,
			message: 'An error occurred while accessing the shared file'
		});
	}
}

async function getStorageHealth(req, res) {
	const required = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
	const missing = required.filter((name) => !process.env[name]);
	const localFallbackEnabled = LOCAL_FALLBACK_ENABLED;

	if (missing.length > 0) {
		return res.json({
			success: false,
			status: 'misconfigured',
			reachable: false,
			mode: localFallbackEnabled ? 'local-fallback' : 'unavailable',
			message: 'Cloud storage env vars are missing',
			missing,
			localFallbackEnabled
		});
	}

	try {
		await r2.send(new HeadBucketCommand({ Bucket: BUCKET }));
		return res.json({
			success: true,
			status: 'healthy',
			reachable: true,
			mode: 'r2',
			message: 'Cloud storage is reachable',
			localFallbackEnabled
		});
	} catch (err) {
		if (isNetworkTimeoutError(err)) {
			return res.status(503).json({
				success: false,
				status: 'degraded',
				reachable: false,
				mode: localFallbackEnabled ? 'local-fallback' : 'unavailable',
				message: 'Cloud storage timeout/unreachable',
				errorCode: err.code || err.name,
				localFallbackEnabled
			});
		}

		return res.status(500).json({
			success: false,
			status: 'error',
			reachable: false,
			mode: localFallbackEnabled ? 'local-fallback' : 'unavailable',
			message: 'Storage health check failed',
			errorCode: err.code || err.name || 'UNKNOWN',
			localFallbackEnabled
		});
	}
}

module.exports = {
	getFiles,
	uploadMultipleFiles,
	getStorageHealth,
	downloadFile,
	deleteFile,
	restoreFile,
	deleteForever,
	renameFile,
	shareFile,
	generateShareLink,
	accessSharedFile
};

