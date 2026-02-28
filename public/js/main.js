// Main application initialization and mobile menu handler
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu functionality
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const navMenu = document.getElementById('navMenu');
    const mobileQuery = window.matchMedia('(max-width: 968px)');

    if (!mobileMenuToggle || !navMenu) {
        return;
    }

    const setMenuState = (isOpen) => {
        navMenu.classList.toggle('active', isOpen);
        mobileMenuToggle.classList.toggle('active', isOpen);
        document.body.classList.toggle('menu-open', isOpen && mobileQuery.matches);
    };

    mobileMenuToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!mobileQuery.matches) {
            return;
        }
        const isOpen = !navMenu.classList.contains('active');
        setMenuState(isOpen);
    });

    // Close mobile menu when clicking outside (only when open)
    document.addEventListener('click', function(event) {
        if (!navMenu.classList.contains('active')) return;
        if (!event.target.closest('.navbar')) {
            setMenuState(false);
        }
    });

    // Close mobile menu when clicking a link
    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function() {
            if (navMenu.classList.contains('active')) {
                setMenuState(false);
            }
        });
    });

    // Close mobile menu with Escape key (only when open)
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && navMenu.classList.contains('active')) {
            setMenuState(false);
        }
    });

    // Sync state when crossing mobile breakpoint
    const onBreakpointChange = () => {
        if (!mobileQuery.matches) {
            setMenuState(false);
        }
    };

    if (typeof mobileQuery.addEventListener === 'function') {
        mobileQuery.addEventListener('change', onBreakpointChange);
    } else if (typeof mobileQuery.addListener === 'function') {
        mobileQuery.addListener(onBreakpointChange);
    }
});
