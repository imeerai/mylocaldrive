// Click/change delegation shared by the Dashboard and Files pages.
// Wires the markup hooks (.file-action-btn, .modal-close-btn, .modal-action-btn, .trash-action-btn)
// to the functions exposed by file-operations.js and file-actions.js.
(() => {
	const call = (name, ...args) => typeof window[name] === 'function' && window[name](...args);

	document.addEventListener('click', (e) => {
		const actionBtn = e.target.closest('.file-action-btn');
		if (actionBtn) {
			e.preventDefault();
			const { action, fileId, fileName, fileSize, uploadDate } = actionBtn.dataset;
			if (action === 'details') call('showFileDetails', fileId, fileName, parseInt(fileSize, 10), uploadDate);
			else if (action === 'delete') call('deleteFile', fileId);
			else if (action === 'rename') call('showRenameModal', fileId, fileName);
			else if (action === 'share') call('showShareModal', fileId);
			return;
		}

		const closeBtn = e.target.closest('.modal-close-btn');
		if (closeBtn) {
			e.preventDefault();
			const modal = closeBtn.dataset.modal && document.getElementById(closeBtn.dataset.modal);
			if (modal) modal.style.display = 'none';
			return;
		}

		const modalActionBtn = e.target.closest('.modal-action-btn');
		if (modalActionBtn) {
			e.preventDefault();
			const map = {
				confirmRename: 'confirmRename',
				confirmShare: 'confirmShare',
				copyShareLink: 'copyShareLink',
				toggleProgressCollapse: 'toggleProgressCollapse',
				toggleProgressVisibility: 'toggleProgressVisibility',
				showProgressPanel: 'toggleProgressVisibility',
				closeProgress: 'hideProgressPopup',
				cancelAllUploads: 'cancelAllUploads'
			};
			if (map[modalActionBtn.dataset.action]) call(map[modalActionBtn.dataset.action]);
			return;
		}

		const trashBtn = e.target.closest('.trash-action-btn');
		if (trashBtn) {
			e.preventDefault();
			const { trashAction, fileId } = trashBtn.dataset;
			if (trashAction === 'restore') call('restoreFile', fileId);
			else if (trashAction === 'deleteForever') call('deleteForever', fileId);
			else if (trashAction === 'bulkDelete') call('bulkDeleteTrash');
			else if (trashAction === 'bulkRestore') call('bulkRestoreTrash');
		}
	});

	document.addEventListener('change', (e) => {
		if (e.target.id === 'selectAllTrash') call('toggleSelectAllTrash');
		else if (e.target.classList.contains('trashCheckbox')) call('updateTrashSelection');
	});
})();
