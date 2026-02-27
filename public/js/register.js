document.addEventListener('DOMContentLoaded', function() {
    // Setup registration form with comprehensive validation
    const form = document.getElementById('registerForm');
    if (!form || !window.validators) {
        return;
    }

    const { validateUsername, validateEmail, validatePasswordStrong, showError } = window.validators;

    const username = document.getElementById('username');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const emailCheckIcon = document.getElementById('emailCheckIcon');
    if (emailCheckIcon) {
        emailCheckIcon.style.display = 'none';
    }

    const usernameError = document.getElementById('usernameError');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');

    const handleUsername = () => validateUsername(username, usernameError);
    const handleEmail = () => validateEmail(email, emailError);
    const handlePassword = () => {
        const strongEnough = validatePasswordStrong(password, passwordError);
        if (!strongEnough) return false;

        const userVal = username.value.trim();
        const passVal = password.value.trim();
        if (userVal && passVal && userVal.toLowerCase() === passVal.toLowerCase()) {
            showError(password, passwordError, 'Password cannot be the same as username');
            return false;
        }
        return true;
    };

    // Simplified email input handling (no availability check, hide icon)
    email.addEventListener('input', () => {
        if (emailCheckIcon) {
            emailCheckIcon.style.display = 'none';
            emailCheckIcon.removeAttribute('data-status');
            emailCheckIcon.innerHTML = '';
        }
        handleEmail();
    });

    username.addEventListener('input', handleUsername);
    password.addEventListener('input', handlePassword);

    form.addEventListener('submit', async function(e) {
        const isUsernameValid = handleUsername();
        const isEmailValid = handleEmail();
        const isPasswordValid = handlePassword();

        if (!isUsernameValid || !isEmailValid || !isPasswordValid) {
            e.preventDefault();
            return false;
        }

        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending verification link...';
        }

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/html'
                },
                body: JSON.stringify({
                    username: username.value.trim(),
                    email: email.value.trim(),
                    password: password.value
                })
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
