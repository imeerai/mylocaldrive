// Shared file operations for Dashboard and Files pages
(() => {
	// DOM Elements (may or may not exist on both pages)
	const dropZone = document.getElementById('dropZone');
	const fileInput = document.getElementById('fileInput');
	const fileListContainer = document.getElementById('fileListContainer');
	const fileList = document.getElementById('fileList');
	const uploadBtn = document.getElementById('uploadBtn');
	const uploadModal = document.getElementById('uploadModal');
	const uploadModalCloseBtn = document.getElementById('uploadModalCloseBtn');
	const cancelUploadBtn = document.getElementById('cancelUploadBtn');
	const selectFilesBtn = document.getElementById('selectFilesBtn');
	const sortSelect = document.getElementById('sortSelect');
	const renameModal = document.getElementById('renameModal');
	const shareModal = document.getElementById('shareModal');
	const confirmModal = document.getElementById('confirmModal');
	const confirmMessageEl = document.getElementById('confirmMessage');
	const confirmOkBtn = document.getElementById('confirmOk');
	const confirmCancelBtn = document.getElementById('confirmCancel');

	// Upload button IDs vary by page
	const uploadOpenBtns = [
		document.getElementById('uploadBtnFloat'),        // Dashboard floating button
		document.getElementById('quickUploadBtn'),         // Dashboard quick upload
		document.getElementById('filesUploadBtn'),         // Files page upload button
		document.getElementById('filesUploadEmptyBtn'),    // Files page empty state button
	].filter(Boolean);

	let selectedFiles = [];

	// ===== Helper Functions =====
	const formatSize = (size) => {
		if (size < 1024) return `${size} B`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
		if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
		return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	};

	const formatTransferRate = (bytesPerSecond) => {
		if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '';
		if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
		if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
		if (bytesPerSecond < 1024 * 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(2)} MB/s`;
		return `${(bytesPerSecond / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
	};

	const formatEta = (seconds) => {
		if (!Number.isFinite(seconds) || seconds <= 0) return '';
		if (seconds < 60) return `${Math.ceil(seconds)}s left`;
		const mins = Math.floor(seconds / 60);
		const secs = Math.ceil(seconds % 60);
		if (mins < 60) return `${mins}m ${secs}s left`;
		const hours = Math.floor(mins / 60);
		const remMins = mins % 60;
		return `${hours}h ${remMins}m left`;
	};

	const updateFileList = () => {
		if (!fileListContainer || !uploadBtn || !fileList) return;

		if (selectedFiles.length === 0) {
			fileListContainer.style.display = 'none';
			uploadBtn.style.display = 'none';
			return;
		}

		fileListContainer.style.display = 'block';
		uploadBtn.style.display = 'block';
		
		// Update file count
		const fileCountEl = document.getElementById('fileCount');
		if (fileCountEl) fileCountEl.textContent = selectedFiles.length;
		
		fileList.innerHTML = selectedFiles.map((file, index) => (
			`<div style="padding: 0.75rem 1rem; color: var(--text-light); border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
				<div style="display: flex; align-items: center; gap: 0.5rem; flex: 1; min-width: 0; overflow: hidden;">
					<i class="fas fa-file" style="color: var(--primary-color); flex-shrink: 0;"></i>
					<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-size: 0.875rem;" title="${file.name}">${file.name}</span>
				</div>
				<div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">
					<span style="font-size: 0.75rem; color: var(--gray-400); white-space: nowrap;">${formatSize(file.size)}</span>
					<button class="file-remove-btn" data-file-index="${index}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.25rem; font-size: 0.875rem; transition: transform 0.2s;" title="Remove">
						<i class="fas fa-times-circle"></i>
					</button>
				</div>
			</div>`
		)).join('');
		
		// Add event listeners to remove buttons
		document.querySelectorAll('.file-remove-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				e.preventDefault();
				const index = parseInt(btn.dataset.fileIndex);
				window.removeFileFromList(index);
			});
			
			// Add hover effect via JS instead of inline handlers
			btn.addEventListener('mouseenter', () => {
				btn.style.transform = 'scale(1.2)';
			});
			btn.addEventListener('mouseleave', () => {
				btn.style.transform = 'scale(1)';
			});
		});
	};

	// Remove file from list
	window.removeFileFromList = (index) => {
		selectedFiles.splice(index, 1);
		updateFileList();
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

	// ===== Upload Functions =====
	const openUploadModal = () => {
		if (uploadModal) uploadModal.style.display = 'flex';
	};

	const closeUploadModal = (clearFiles = true) => {
		if (uploadModal) uploadModal.style.display = 'none';
		if (clearFiles) {
			selectedFiles = [];
			updateFileList();
		}
		if (uploadBtn) {
			uploadBtn.disabled = false;
			uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Upload';
		}
		const progressContainer = document.getElementById('progressContainer');
		if (progressContainer) progressContainer.style.display = 'none';
	};

	// Upload files with progress popup
	let cancelledFiles = new Set();
	let cancelAllRequested = false;
	let currentUploadingIndex = -1;
	let currentUploadController = null;
	let progressPanelHidden = false;
	let progressPanelCollapsed = false;
	let refreshUploadSummary = null;

	const isMobileProgressView = () => window.innerWidth <= 768;
	const getHiddenTransform = () => 'translateY(110%)';
	const getVisibleTransform = () => 'translateY(0)';

	const finalizeUploadRow = (index, state = 'completed') => {
		const rowEl = document.getElementById(`uploadFile_${index}`);
		const listEl = document.getElementById('uploadFilesList');
		const cancelBtn = document.querySelector(`.cancel-file-btn[data-file-index="${index}"]`);
		const progressWrapEl = document.getElementById(`fileProgressWrap_${index}`);
		if (!rowEl || !listEl) return;

		if (cancelBtn) cancelBtn.style.display = 'none';
		rowEl.style.opacity = state === 'completed' ? '0.88' : '0.76';
		rowEl.style.paddingTop = '0.55rem';
		rowEl.style.paddingBottom = '0.55rem';

		if (progressWrapEl) {
			progressWrapEl.style.transition = 'max-height 0.25s ease, opacity 0.25s ease, margin 0.25s ease';
			progressWrapEl.style.maxHeight = '0';
			progressWrapEl.style.opacity = '0';
			progressWrapEl.style.marginTop = '0';
			progressWrapEl.style.overflow = 'hidden';
		}

		listEl.appendChild(rowEl);
	};

	const uploadSingleFileWithProgress = (file, index, onProgress) => new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/files/upload');
		xhr.responseType = 'json';

		currentUploadController = {
			abort: () => xhr.abort(),
		};

		xhr.upload.onprogress = (event) => {
			if (!event.lengthComputable || typeof onProgress !== 'function') return;
			const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
			onProgress(percent, event.loaded, event.total);
		};

		xhr.onload = () => {
			if (cancelledFiles.has(index)) {
				reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
				return;
			}

			let data = xhr.response;
			if (!data || typeof data !== 'object') {
				try {
					data = JSON.parse(xhr.responseText || '{}');
				} catch (err) {
					data = {};
				}
			}

			if (xhr.status >= 200 && xhr.status < 300) {
				resolve(data);
				return;
			}

			const errorMessage = data && data.error ? data.error : `Upload failed with status ${xhr.status}`;
			reject(new Error(errorMessage));
		};

		xhr.onerror = () => {
			reject(new Error('Network error while uploading file'));
		};

		xhr.onabort = () => {
			reject(Object.assign(new Error('Upload cancelled'), { name: 'AbortError' }));
		};

		const formData = new FormData();
		formData.append('files', file);
		xhr.send(formData);
	});
	
	window.uploadFiles = async () => {
		if (!uploadBtn) return;
		if (selectedFiles.length === 0) {
			window.showError && window.showError('Please select files to upload');
			return;
		}

		// Close upload modal WITHOUT clearing files
		closeUploadModal(false);
		showProgressPopup();
		
		cancelAllRequested = false;
		currentUploadingIndex = -1;
		currentUploadController = null;
		cancelledFiles.clear();

		// Update summary
		const summaryEl = document.getElementById('progressPopupSummary');
		if (summaryEl) summaryEl.textContent = 'Starting uploads...';
		const headerTitleEl = document.getElementById('progressHeaderTitle');
		if (headerTitleEl) headerTitleEl.textContent = `Uploading ${selectedFiles.length} item${selectedFiles.length === 1 ? '' : 's'}`;
		
		// Create file list in progress popup
		const uploadFilesList = document.getElementById('uploadFilesList');
		
		if (uploadFilesList) {
			uploadFilesList.innerHTML = selectedFiles.map((file, index) => `
				<div id="uploadFile_${index}" style="padding: 0.72rem 0.9rem; border-bottom: 1px solid rgba(255,255,255,0.08); transition: opacity 0.25s; background: rgba(0,0,0,0.12);">
					<div style="display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
						<div style="display: flex; align-items: center; gap: 0.62rem; min-width: 0; flex: 1;">
							<i class="fas fa-file-alt" style="color: var(--primary-color); font-size: 0.9rem; flex-shrink: 0;"></i>
							<div style="min-width: 0; flex: 1;">
								<div style="font-size: 0.9rem; color: var(--text-dark); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${file.name}">${file.name}</div>
								<div id="fileSubStatus_${index}" style="font-size: 0.74rem; color: var(--text-light); margin-top: 0.08rem;">Waiting...</div>
							</div>
						</div>
						<div style="display: flex; align-items: center; gap: 0.45rem; flex-shrink: 0;">
							<span id="fileStatus_${index}" style="font-size: 0.9rem; color: var(--text-light); white-space: nowrap;"><i class="fas fa-hourglass-half" style="opacity: 0.85;"></i></span>
							<button class="cancel-file-btn" data-file-index="${index}" style="display: none; background: none; border: none; color: #ef4444; cursor: pointer; padding: 0.2rem; font-size: 1rem; opacity: 0.8; transition: all 0.2s;" title="Cancel this file">
								<i class="fas fa-times-circle"></i>
							</button>
						</div>
					</div>
					<div id="fileProgressWrap_${index}" style="background: rgba(129, 140, 248, 0.15); height: 3px; border-radius: 999px; overflow: hidden; max-height: 3px; margin-top: 0.45rem;">
						<div id="fileProgress_${index}" style="background: linear-gradient(90deg, var(--primary-color), var(--primary-dark)); height: 100%; width: 0%; transition: width 0.25s ease;"></div>
					</div>
				</div>
			`).join('');
			// Add event listeners to cancel buttons
			document.querySelectorAll('.cancel-file-btn').forEach(btn => {
				btn.addEventListener('click', (e) => {
					e.preventDefault();
					const index = parseInt(btn.dataset.fileIndex);
					cancelFileUpload(index);
				});
				btn.addEventListener('mouseenter', () => {
					btn.style.opacity = '1';
					btn.style.transform = 'scale(1.15)';
				});
				btn.addEventListener('mouseleave', () => {
					btn.style.opacity = '0.7';
					btn.style.transform = 'scale(1)';
				});
			});
		}

		const totalFiles = selectedFiles.length;
		let uploadedCount = 0;
		let failedCount = 0;
		let currentSpeedBps = 0;
		let currentEtaSeconds = 0;

		const getRemainingFilesCount = () => Math.max(0, totalFiles - uploadedCount - failedCount - cancelledFiles.size);

		const updateSummary = () => {
			const summaryEl = document.getElementById('progressPopupSummary');
			const headerTitleEl = document.getElementById('progressHeaderTitle');
			if (!summaryEl) return;
			const cancelledCount = cancelledFiles.size;
			const remainingCount = getRemainingFilesCount();
			let summaryText = `${uploadedCount} of ${totalFiles} uploaded`;
			const speedText = formatTransferRate(currentSpeedBps);
			const etaText = formatEta(currentEtaSeconds);
			if (remainingCount > 0 && speedText && etaText) {
				summaryText = `Uploading... ${speedText} • ${etaText}`;
			}
			if (remainingCount === totalFiles) summaryText = 'Starting uploads...';
			if (remainingCount === 0) summaryText = 'Upload complete';
			if (headerTitleEl) {
				headerTitleEl.textContent = remainingCount > 0
					? `Uploading ${remainingCount} item${remainingCount === 1 ? '' : 's'}`
					: `Upload complete`;
			}
			summaryEl.textContent = summaryText;
		};

		refreshUploadSummary = updateSummary;
		updateSummary();

		for (let index = 0; index < selectedFiles.length; index += 1) {
			if (cancelAllRequested) break;
			if (cancelledFiles.has(index)) {
				updateSummary();
				continue;
			}

			const file = selectedFiles[index];
			const statusEl = document.getElementById(`fileStatus_${index}`);
			const subStatusEl = document.getElementById(`fileSubStatus_${index}`);
			const progressEl = document.getElementById(`fileProgress_${index}`);
			const totalPendingBytes = selectedFiles.reduce((sum, selectedFile, fileIndex) => {
				if (fileIndex <= index || cancelledFiles.has(fileIndex)) return sum;
				return sum + (selectedFile.size || 0);
			}, 0);
			let uploadedBytesForCurrentFile = 0;
			let lastLoadedBytes = 0;
			let lastProgressTs = Date.now();
			let smoothedSpeed = 0;

			if (statusEl) statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: var(--primary-color);"></i>';
			if (subStatusEl) subStatusEl.textContent = `Uploading ${formatSize(file.size)}`;
			currentUploadingIndex = index;

			try {
				const data = await uploadSingleFileWithProgress(file, index, (percent, loaded = 0) => {
					if (cancelledFiles.has(index)) return;
					const now = Date.now();
					const deltaBytes = Math.max(0, loaded - lastLoadedBytes);
					const deltaMs = Math.max(1, now - lastProgressTs);
					const instantSpeed = deltaBytes / (deltaMs / 1000);
					smoothedSpeed = smoothedSpeed === 0 ? instantSpeed : (smoothedSpeed * 0.75) + (instantSpeed * 0.25);
					lastLoadedBytes = loaded;
					lastProgressTs = now;
					uploadedBytesForCurrentFile = loaded;
					const currentFileRemainingBytes = Math.max(0, (file.size || 0) - uploadedBytesForCurrentFile);
					const totalRemainingBytes = currentFileRemainingBytes + totalPendingBytes;
					currentSpeedBps = smoothedSpeed;
					currentEtaSeconds = smoothedSpeed > 0 ? (totalRemainingBytes / smoothedSpeed) : 0;
					if (progressEl) progressEl.style.width = `${percent}%`;
					if (statusEl) {
						const speedLabel = formatTransferRate(smoothedSpeed);
						statusEl.innerHTML = '<i class="fas fa-spinner fa-spin" style="color: var(--primary-color);"></i>';
						if (subStatusEl) {
							subStatusEl.textContent = speedLabel
								? `${percent}% • ${speedLabel}`
								: `${percent}%`;
						}
					}
					updateSummary();
				});

				if (cancelledFiles.has(index)) {
					if (statusEl) statusEl.innerHTML = '<i class="fas fa-ban" style="color: #ef4444;"></i> Cancelled';
					if (progressEl) progressEl.style.width = '0%';
					updateSummary();
					continue;
				}

				if (data.success) {
					uploadedCount += 1;
					currentSpeedBps = 0;
					currentEtaSeconds = 0;
					if (progressEl) progressEl.style.width = '100%';
					if (statusEl) statusEl.innerHTML = '<i class="fas fa-check-circle" style="color: #10b981;"></i>';
					if (subStatusEl) subStatusEl.textContent = 'Uploaded';
					finalizeUploadRow(index, 'completed');
				} else {
					failedCount += 1;
					currentSpeedBps = 0;
					currentEtaSeconds = 0;
					if (statusEl) statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>';
					if (subStatusEl) subStatusEl.textContent = 'Failed';
					finalizeUploadRow(index, 'failed');
				}
				updateSummary();
			} catch (err) {
				if (err.name === 'AbortError') {
					if (cancelAllRequested || cancelledFiles.has(index)) {
						currentSpeedBps = 0;
						currentEtaSeconds = 0;
						if (statusEl) statusEl.innerHTML = '<i class="fas fa-ban" style="color: #ef4444;"></i>';
						if (subStatusEl) subStatusEl.textContent = 'Cancelled';
						if (progressEl) progressEl.style.width = '0%';
						finalizeUploadRow(index, 'cancelled');
						updateSummary();
						continue;
					}
				}
				failedCount += 1;
				currentSpeedBps = 0;
				currentEtaSeconds = 0;
				if (statusEl) statusEl.innerHTML = '<i class="fas fa-exclamation-circle" style="color: #ef4444;"></i>';
				if (subStatusEl) subStatusEl.textContent = 'Failed';
				finalizeUploadRow(index, 'failed');
				updateSummary();
			}
		}

		currentUploadingIndex = -1;
		currentUploadController = null;
		refreshUploadSummary = null;

		if (cancelAllRequested) {
			window.showError && window.showError('Upload cancelled');
			setTimeout(() => hideProgressPopup(), 900);
			return;
		}

		if (uploadedCount > 0) {
			window.showSuccess && window.showSuccess(`${uploadedCount} file(s) uploaded successfully`);
		}

		setTimeout(() => {
			hideProgressPopup();
			location.reload();
		}, 1800);
	};

	// Progress popup helper functions
	const showProgressPopup = () => {
		const popup = document.getElementById('uploadProgressPopup');
		const reopenBtn = document.getElementById('reopenUploadPanelBtn');
		if (popup) {
			popup.style.display = 'block';
			popup.style.opacity = '1';
			popup.style.width = isMobileProgressView() ? 'calc(100vw - 16px)' : '380px';
			progressPanelCollapsed = false;
			updateProgressCollapseUI();
			progressPanelHidden = false;
			if (reopenBtn) reopenBtn.style.display = 'none';
			// Trigger slide-in animation
			setTimeout(() => {
				popup.style.transform = getVisibleTransform();
			}, 10);
		} else {
			console.error('[Upload] Progress popup element not found!');
		}
	};

	const hideProgressPopup = () => {
		const popup = document.getElementById('uploadProgressPopup');
		const reopenBtn = document.getElementById('reopenUploadPanelBtn');
		if (popup) {
			// Slide out animation
			popup.style.transform = getHiddenTransform();
			popup.style.opacity = '0';
			setTimeout(() => {
				popup.style.display = 'none';
				if (reopenBtn) reopenBtn.style.display = 'none';
				progressPanelHidden = false;
				selectedFiles = [];  // Clear files after popup is hidden
				updateFileList();
			}, 300);
		}
	};

	const toggleProgressVisibility = () => {
		const popup = document.getElementById('uploadProgressPopup');
		const reopenBtn = document.getElementById('reopenUploadPanelBtn');
		if (!popup) return;

		if (!progressPanelHidden) {
			popup.style.transform = getHiddenTransform();
			popup.style.opacity = '0';
			progressPanelHidden = true;
			if (reopenBtn) reopenBtn.style.display = 'flex';
			return;
		}

		popup.style.display = 'block';
		popup.style.opacity = '1';
		setTimeout(() => {
			popup.style.transform = getVisibleTransform();
		}, 10);
		progressPanelHidden = false;
		if (reopenBtn) reopenBtn.style.display = 'none';
	};

	const updateProgressCollapseUI = () => {
		const popup = document.getElementById('uploadProgressPopup');
		const content = document.getElementById('progressPopupContent');
		const titleBlock = document.getElementById('progressTitleBlock');
		const cancelAllBtn = document.getElementById('cancelAllUploadsBtn');
		const collapseBtn = document.getElementById('toggleCollapseBtn');
		if (!popup || !content || !titleBlock || !cancelAllBtn || !collapseBtn) return;

		if (isMobileProgressView()) {
			popup.style.width = 'calc(100vw - 16px)';
			content.style.display = 'block';
			titleBlock.style.display = 'block';
			cancelAllBtn.style.display = 'inline-flex';
			collapseBtn.style.display = 'none';
			progressPanelCollapsed = false;
			return;
		}

		collapseBtn.style.display = 'inline-flex';

		if (progressPanelCollapsed) {
			popup.style.width = '300px';
			content.style.display = 'none';
			titleBlock.style.display = 'block';
			cancelAllBtn.style.display = 'none';
			collapseBtn.title = 'Expand Panel';
			const icon = collapseBtn.querySelector('i');
			if (icon) icon.className = 'fas fa-chevron-up';
		} else {
			popup.style.width = '380px';
			content.style.display = 'block';
			titleBlock.style.display = 'block';
			cancelAllBtn.style.display = 'inline-flex';
			collapseBtn.title = 'Collapse Panel';
			const icon = collapseBtn.querySelector('i');
			if (icon) icon.className = 'fas fa-chevron-down';
		}
	};

	const toggleProgressCollapse = () => {
		progressPanelCollapsed = !progressPanelCollapsed;
		updateProgressCollapseUI();
	};

	const cancelFileUpload = (index) => {
		if (cancelledFiles.has(index)) return;
		
		cancelledFiles.add(index);
		const fileEl = document.getElementById(`uploadFile_${index}`);
		const statusEl = document.getElementById(`fileStatus_${index}`);
		const cancelBtn = document.querySelector(`.cancel-file-btn[data-file-index="${index}"]`);
		
		if (fileEl) {
			fileEl.style.opacity = '0.5';
		}
		if (statusEl) {
			statusEl.innerHTML = '<i class="fas fa-ban" style="color: #ef4444;"></i>';
		}
		const subStatusEl = document.getElementById(`fileSubStatus_${index}`);
		if (subStatusEl) {
			subStatusEl.textContent = 'Cancelled';
		}
		if (cancelBtn) {
			cancelBtn.disabled = true;
			cancelBtn.style.opacity = '0.35';
			cancelBtn.style.cursor = 'not-allowed';
		}
		if (index === currentUploadingIndex && currentUploadController) {
			currentUploadController.abort();
		}

		finalizeUploadRow(index, 'cancelled');

		if (typeof refreshUploadSummary === 'function') {
			refreshUploadSummary();
		}
	};

	const cancelAllUploads = async () => {
		const ok = await confirmAction('Cancel all uploads? Files will not be uploaded.');
		if (!ok) return;

		cancelAllRequested = true;
		if (currentUploadController) {
			currentUploadController.abort();
		}

		selectedFiles.forEach((_, index) => {
			if (!cancelledFiles.has(index)) cancelFileUpload(index);
		});

		setTimeout(() => hideProgressPopup(), 900);
	};

	// Expose progress popup functions
	window.cancelFileUpload = cancelFileUpload;
	window.cancelAllUploads = cancelAllUploads;
	window.hideProgressPopup = hideProgressPopup;
	window.toggleProgressVisibility = toggleProgressVisibility;
	window.toggleProgressCollapse = toggleProgressCollapse;

	// Expose open modal for external use
	window.openUploadModal = openUploadModal;

	// Non-upload file actions moved to /js/file-actions.js

	// ===== Event Listeners =====
	
	// Drag and Drop
	if (dropZone) {
		dropZone.addEventListener('dragover', (e) => {
			e.preventDefault();
			dropZone.style.background = 'rgba(129, 140, 248, 0.15)';
			dropZone.style.borderColor = '#06b6d4';
		});

		dropZone.addEventListener('dragleave', () => {
			dropZone.style.background = 'rgba(129, 140, 248, 0.07)';
			dropZone.style.borderColor = 'var(--primary-color)';
		});

		dropZone.addEventListener('drop', (e) => {
			e.preventDefault();
			dropZone.style.background = 'rgba(129, 140, 248, 0.07)';
			dropZone.style.borderColor = 'var(--primary-color)';
			selectedFiles = Array.from(e.dataTransfer.files || []);
			updateFileList();
		});

		dropZone.addEventListener('click', () => {
			if (fileInput) fileInput.click();
		});
	}

	// File input change
	if (fileInput) {
		fileInput.addEventListener('change', (e) => {
			selectedFiles = Array.from(e.target.files);
			updateFileList();
		});
	}

	// Upload buttons
	uploadOpenBtns.forEach(btn => {
		if (btn) btn.addEventListener('click', openUploadModal);
	});

	if (uploadModalCloseBtn) uploadModalCloseBtn.addEventListener('click', closeUploadModal);
	if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', closeUploadModal);
	if (selectFilesBtn) selectFilesBtn.addEventListener('click', () => fileInput && fileInput.click());

	// Close modals on outside click
	[uploadModal, renameModal, shareModal, confirmModal].forEach((modal) => {
		if (!modal) return;
		modal.addEventListener('click', (e) => {
			if (e.target === modal) {
				if (modal === uploadModal) {
					closeUploadModal();
				} else {
					modal.style.display = 'none';
				}
			}
		});
	});

	// Upload on button click
	if (uploadBtn) {
		uploadBtn.addEventListener('click', window.uploadFiles);
	}

	const reopenUploadPanelBtn = document.getElementById('reopenUploadPanelBtn');
	if (reopenUploadPanelBtn) {
		reopenUploadPanelBtn.addEventListener('click', () => {
			if (window.toggleProgressVisibility) window.toggleProgressVisibility();
		});
	}

	window.addEventListener('resize', () => {
		const popup = document.getElementById('uploadProgressPopup');
		if (!popup || popup.style.display === 'none') return;
		updateProgressCollapseUI();
		popup.style.transform = progressPanelHidden ? getHiddenTransform() : getVisibleTransform();
	});

})();
