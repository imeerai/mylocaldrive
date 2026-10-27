// Custom Modal System - Reusable modal dialogs for alerts and confirmations
(function() {
	let confirmResolve = null;

	// Create modal HTML if not exists - initializes modal structures in DOM
	function createModals() {
		if (document.getElementById('customModal')) return;
		
		const modalHTML = `
			<!-- Error/Success Modal -->
			<div id="customModal" class="modal z-[9999]" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
				<div id="modalContent" class="modal-panel max-w-[440px]">
					<div class="flex items-start gap-4">
						<i id="modalIcon" class="fas fa-exclamation-circle mt-1 shrink-0 text-xl"></i>
						<div class="flex-1">
							<h3 id="modalTitle" class="serif m-0 text-[30px] leading-none">Error</h3>
							<p id="modalMessage" class="mt-3 mb-6 leading-relaxed text-muted"></p>
							<button type="button" id="modalOkBtn" class="btn btn-dark btn-sm">OK</button>
						</div>
					</div>
				</div>
			</div>

			<!-- Confirmation Modal -->
			<div id="customConfirmModal" class="modal z-[9999]" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="customConfirmTitle">
				<div class="modal-panel max-w-[440px]">
					<h3 id="customConfirmTitle" class="serif m-0 text-[30px] leading-none">Are you <i>sure?</i></h3>
					<p id="confirmMessage" class="mt-3 mb-6 leading-relaxed text-muted"></p>
					<div class="flex flex-wrap justify-end gap-2.5">
						<button type="button" id="confirmCancelBtn" class="btn btn-light btn-sm">Cancel</button>
						<button type="button" id="confirmOkBtn" class="btn btn-dark btn-sm">OK</button>
					</div>
				</div>
			</div>
		`;
		
		document.body.insertAdjacentHTML('beforeend', modalHTML);
		
		// Add event listeners
		document.getElementById('modalOkBtn')?.addEventListener('click', closeModal);
		document.getElementById('confirmOkBtn')?.addEventListener('click', () => handleConfirm(true));
		document.getElementById('confirmCancelBtn')?.addEventListener('click', () => handleConfirm(false));
	}

	// Show error modal
	window.showError = (message) => {
		createModals();
		const modal = document.getElementById('customModal');
		const content = document.getElementById('modalContent');
		const icon = document.getElementById('modalIcon');
		const title = document.getElementById('modalTitle');
		const messageEl = document.getElementById('modalMessage');
		
				if (icon) {
			icon.className = 'fas fa-exclamation-circle';
			icon.style.color = '#a4472f';
		}
		if (title) title.textContent = 'Error';
		if (messageEl) messageEl.textContent = message;
		if (modal) modal.style.display = 'flex';
	};

	// Show success modal
	window.showSuccess = (message) => {
		createModals();
		const modal = document.getElementById('customModal');
		const content = document.getElementById('modalContent');
		const icon = document.getElementById('modalIcon');
		const title = document.getElementById('modalTitle');
		const messageEl = document.getElementById('modalMessage');
		
				if (icon) {
			icon.className = 'fas fa-check-circle';
			icon.style.color = '#3f7d5a';
		}
		if (title) title.textContent = 'Success';
		if (messageEl) messageEl.textContent = message;
		if (modal) modal.style.display = 'flex';
	};

	// Show confirmation modal (returns promise)
	window.showConfirm = (message) => {
		createModals();
		const modal = document.getElementById('customConfirmModal');
		const messageEl = document.getElementById('confirmMessage');
		
		if (messageEl) messageEl.textContent = message;
		if (modal) modal.style.display = 'flex';
		
		return new Promise((resolve) => {
			confirmResolve = resolve;
		});
	};

	// Close modal
	window.closeModal = () => {
		const modal = document.getElementById('customModal');
		if (modal) modal.style.display = 'none';
	};

	// Handle confirmation result
	function handleConfirm(result) {
		const modal = document.getElementById('customConfirmModal');
		if (modal) modal.style.display = 'none';
		if (confirmResolve) {
			confirmResolve(result);
			confirmResolve = null;
		}
	}

	// Close on outside click
	document.addEventListener('click', (e) => {
		const modal = document.getElementById('customModal');
		const confirmModal = document.getElementById('customConfirmModal');
		if (e.target === modal) closeModal();
		if (e.target === confirmModal) handleConfirm(false);
	});

	// Close on Escape key
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') {
			closeModal();
			handleConfirm(false);
		}
	});

	// Backwards compatibility
	window.closeErrorModal = closeModal;
})();
