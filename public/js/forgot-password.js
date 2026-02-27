document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('forgotPasswordForm');
    if (!form) {
        return;
    }

    const emailInput = document.getElementById('email');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = (emailInput?.value || '').trim();
        if (!email) {
            form.submit();
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending OTP...';
        }

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/html'
                },
                body: JSON.stringify({ email })
            });

            if (response.redirected) {
                window.location.assign(response.url);
                return;
            }

            window.location.reload();
        } catch (err) {
            form.submit();
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        }
    });
});
