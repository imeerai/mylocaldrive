// Shared file actions extracted from file-operations.js
(() => {
	const renameModal = document.getElementById('renameModal');
	const shareModal = document.getElementById('shareModal');
	const confirmModal = document.getElementById('confirmModal');
	const confirmMessageEl = document.getElementById('confirmMessage');
	const confirmOkBtn = document.getElementById('confirmOk');
	const confirmCancelBtn = document.getElementById('confirmCancel');
	const sortSelect = document.getElementById('sortSelect');

	const formatSize = (size) => {
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
		if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
		return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	const confirmAction = async (message) => {
		if (!confirmModal || !confirmMessageEl || !confirmOkBtn || !confirmCancelBtn) {
			return window.confirm(message);
		}
		return new Promise((resolve) => {
			confirmMessageEl.textContent = message;
			confirmModal.style.display = 'flex';
			const cleanup = () => {
				confirmModal.style.display = 'none';
				confirmOkBtn.onclick = null;
				confirmCancelBtn.onclick = null;
			};
			confirmOkBtn.onclick = () => { cleanup(); resolve(true); };
			confirmCancelBtn.onclick = () => { cleanup(); resolve(false); };
		});
	};

	window.showFileDetails = (fileId, fileName, fileSize, uploadDate) => {
		const modal = document.getElementById('fileDetailsModal');
		const fileNameEl = document.getElementById('detailFileName');
		const fileSizeEl = document.getElementById('detailFileSize');
		const uploadDateEl = document.getElementById('detailUploadDate');

		if (fileNameEl) fileNameEl.textContent = fileName;
		if (fileSizeEl) fileSizeEl.textContent = formatSize(fileSize);
		if (uploadDateEl) {
			const date = new Date(uploadDate);
			uploadDateEl.textContent = date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		}
		if (modal) modal.style.display = 'flex';
	};

	window.deleteFileFromDashboard = async (fileId) => {
		if (!fileId) return;
		const ok = await confirmAction('Move this file to the Recycle Bin?');
		if (!ok) return;

		fetch(`/files/${fileId}`, { method: 'DELETE' })
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
					window.showSuccess && window.showSuccess('File deleted successfully');
					setTimeout(() => location.reload(), 1500);
				} else {
					window.showError && window.showError(data.error || 'Failed to delete file');
				}
			})
			.catch((err) => {
				console.error('Delete error:', err);
				window.showError && window.showError('Failed to delete file');
			});
	};

	window.deleteFile = window.deleteFileFromDashboard;

	window.restoreFile = async (fileId) => {
		if (!fileId) return;
		fetch(`/files/${fileId}/restore`, { method: 'POST' })
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
					window.showSuccess && window.showSuccess('File restored successfully');
					setTimeout(() => location.reload(), 1500);
				} else {
					window.showError && window.showError(data.error || 'Failed to restore file');
				}
			})
			.catch((err) => {
				console.error('Restore error:', err);
				window.showError && window.showError('Failed to restore file');
			});
	};

	window.deleteForever = async (fileId) => {
		if (!fileId) return;
		const ok = await confirmAction('Permanently delete this file? This cannot be undone.');
		if (!ok) return;

		fetch(`/files/${fileId}/permanent`, { method: 'DELETE' })
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
					window.showSuccess && window.showSuccess('File permanently deleted');
					setTimeout(() => location.reload(), 1500);
				} else {
					window.showError && window.showError(data.error || 'Failed to delete file permanently');
				}
			})
			.catch((err) => {
				console.error('Permanent delete error:', err);
				window.showError && window.showError('Failed to delete file permanently');
			});
	};

	window.showRenameModal = (fileId, fileName) => {
		const renameFileId = document.getElementById('renameFileId');
		const renameOriginalExt = document.getElementById('renameOriginalExt');
		const newFileName = document.getElementById('newFileName');
		if (!renameModal || !renameFileId || !newFileName) return;

		const lastDotIndex = fileName.lastIndexOf('.');
		const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
		const ext = lastDotIndex > 0 ? fileName.slice(lastDotIndex) : '';

		renameFileId.value = fileId;
		if (renameOriginalExt) renameOriginalExt.value = ext;
		newFileName.value = baseName;
		renameModal.style.display = 'flex';
		newFileName.focus();
		newFileName.select();
	};

	window.confirmRename = () => {
		const renameFileId = document.getElementById('renameFileId');
		const renameOriginalExt = document.getElementById('renameOriginalExt');
		const newFileName = document.getElementById('newFileName');
		if (!renameFileId || !newFileName) return;

		const fileId = renameFileId.value;
		const baseName = newFileName.value.trim();
		const ext = renameOriginalExt ? renameOriginalExt.value : '';
		const newName = `${baseName}${ext}`;

		if (!baseName) {
			window.showError && window.showError('Please enter a file name');
			return;
		}

		if (baseName.includes('.')) {
			window.showError && window.showError('Extension cannot be changed. Please edit only the name.');
			return;
		}

		fetch(`/files/${fileId}/rename`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ newName }),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
					if (renameModal) renameModal.style.display = 'none';
					window.showSuccess && window.showSuccess('File renamed successfully');
					setTimeout(() => location.reload(), 1500);
				} else {
					window.showError && window.showError(data.error || 'Failed to rename file');
				}
			})
			.catch((err) => {
				console.error('Rename error:', err);
				window.showError && window.showError('Failed to rename file');
			});
	};

	window.showShareModal = (fileId) => {
		const shareFileId = document.getElementById('shareFileId');
		const shareUsername = document.getElementById('shareUsername');
		const shareLink = document.getElementById('shareLink');
		if (!shareModal || !shareFileId || !shareUsername) return;

		shareFileId.value = fileId;
		shareUsername.value = '';
		if (shareLink) shareLink.value = '';
		generateShareLink(fileId);
		shareModal.style.display = 'flex';
		shareUsername.focus();
	};

	const generateShareLink = async (fileId) => {
		try {
			const res = await fetch(`/files/${fileId}/generate-share-link`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			const data = await res.json();

			const shareLinkInput = document.getElementById('shareLink');
			if (shareLinkInput) {
				shareLinkInput.value = data.success && data.shareLink ? data.shareLink : 'Failed to generate link';
			}
		} catch (err) {
			console.error('Error generating share link:', err);
			const shareLinkInput = document.getElementById('shareLink');
			if (shareLinkInput) shareLinkInput.value = 'Error generating link';
		}
	};

	window.copyShareLink = () => {
		const linkInput = document.getElementById('shareLink');
		if (!linkInput || !linkInput.value) {
			window.showError && window.showError('No link to copy');
			return;
		}

		linkInput.select();
		document.execCommand('copy');

		const btn = document.getElementById('copyLinkBtn');
		if (btn) {
			const originalHTML = btn.innerHTML;
			btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
			btn.style.background = '#10b981';
			setTimeout(() => {
				btn.innerHTML = originalHTML;
				btn.style.background = '#06b6d4';
			}, 2000);
		}
	};

	window.confirmShare = () => {
		const shareFileId = document.getElementById('shareFileId');
		const shareUsername = document.getElementById('shareUsername');
		if (!shareFileId || !shareUsername) return;

		const fileId = shareFileId.value;
		const username = shareUsername.value.trim();
		if (!username) {
			window.showError && window.showError('Please enter a username');
			return;
		}

		fetch(`/files/${fileId}/share`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ sharedWithUsername: username }),
		})
			.then((res) => res.json())
			.then((data) => {
				if (data.success) {
					if (shareModal) shareModal.style.display = 'none';
					window.showSuccess && window.showSuccess('File shared successfully!');
					setTimeout(() => location.reload(), 1500);
				} else {
					window.showError && window.showError(data.error || 'Failed to share file');
				}
			})
			.catch((err) => {
				console.error('Share error:', err);
				window.showError && window.showError('Failed to share file');
			});
	};

	window.toggleSelectAllTrash = () => {
		const selectAllCheckbox = document.getElementById('selectAllTrash');
		const trashCheckboxes = document.querySelectorAll('.trashCheckbox');
		if (!selectAllCheckbox) return;

		trashCheckboxes.forEach((checkbox) => {
			checkbox.checked = selectAllCheckbox.checked;
		});
		window.updateTrashSelection();
	};

	window.updateTrashSelection = () => {
		const trashCheckboxes = document.querySelectorAll('.trashCheckbox:checked');
		const selectAllCheckbox = document.getElementById('selectAllTrash');
		const countEl = document.getElementById('trashSelectedCount');
		const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
		const bulkRestoreBtn = document.getElementById('bulkRestoreBtn');

		const count = trashCheckboxes.length;
		if (countEl) countEl.textContent = `${count} selected`;

		const totalCheckboxes = document.querySelectorAll('.trashCheckbox').length;
		if (selectAllCheckbox) {
			selectAllCheckbox.checked = count === totalCheckboxes && totalCheckboxes > 0;
			selectAllCheckbox.indeterminate = count > 0 && count < totalCheckboxes;
		}

		if (bulkDeleteBtn) bulkDeleteBtn.style.display = count > 0 ? 'block' : 'none';
		if (bulkRestoreBtn) bulkRestoreBtn.style.display = count > 0 ? 'block' : 'none';
	};

	window.bulkDeleteTrash = async () => {
		const trashCheckboxes = document.querySelectorAll('.trashCheckbox:checked');
		if (trashCheckboxes.length === 0) {
			window.showError && window.showError('Please select files to delete');
			return;
		}

		const ok = await confirmAction(`Permanently delete ${trashCheckboxes.length} file(s)? This cannot be undone.`);
		if (!ok) return;

		const fileIds = Array.from(trashCheckboxes).map((cb) => cb.value);
		let deletedCount = 0;
		for (const fileId of fileIds) {
			try {
				const res = await fetch(`/files/${fileId}/permanent`, { method: 'DELETE' });
				const data = await res.json();
				if (data.success) deletedCount += 1;
			} catch (err) {
				console.error('Error deleting file:', err);
			}
		}

		if (deletedCount > 0) {
			window.showSuccess && window.showSuccess(`${deletedCount} file(s) permanently deleted`);
			setTimeout(() => location.reload(), 1500);
		} else {
			window.showError && window.showError('Failed to delete selected files');
		}
	};

	window.bulkRestoreTrash = async () => {
		const trashCheckboxes = document.querySelectorAll('.trashCheckbox:checked');
		if (trashCheckboxes.length === 0) {
			window.showError && window.showError('Please select files to restore');
			return;
		}

		const fileIds = Array.from(trashCheckboxes).map((cb) => cb.value);
		let restoredCount = 0;
		for (const fileId of fileIds) {
			try {
				const res = await fetch(`/files/${fileId}/restore`, { method: 'POST' });
				const data = await res.json();
				if (data.success) restoredCount += 1;
			} catch (err) {
				console.error('Error restoring file:', err);
			}
		}

		if (restoredCount > 0) {
			window.showSuccess && window.showSuccess(`${restoredCount} file(s) restored successfully`);
			setTimeout(() => location.reload(), 1500);
		} else {
			window.showError && window.showError('Failed to restore selected files');
		}
	};

	window.handleSort = (sortValue) => {
		window.location.href = `/files?sort=${sortValue}&page=1`;
	};

	if (sortSelect) {
		sortSelect.addEventListener('change', (e) => window.handleSort(e.target.value));
	}

	const newFileNameInput = document.getElementById('newFileName');
	if (newFileNameInput) {
		newFileNameInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') window.confirmRename();
		});
	}

	const shareUsernameInput = document.getElementById('shareUsername');
	if (shareUsernameInput) {
		shareUsernameInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') window.confirmShare();
		});
	}
})();
