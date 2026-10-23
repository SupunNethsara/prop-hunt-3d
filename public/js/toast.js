// Ultra-Modern Cyberpunk Toast Notification System
class ToastNotifier {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    document.body.appendChild(this.container);

    // Override browser window.alert to modern toast!
    window.alert = (msg) => this.show(msg, 'info');
  }

  show(message, type = 'info', title = null) {
    const toast = document.createElement('div');
    toast.className = `cyber-toast toast-${type}`;

    let icon = 'ℹ️';
    let defaultTitle = 'Notice';
    if (type === 'success') {
      icon = '✅';
      defaultTitle = 'Success';
    } else if (type === 'error') {
      icon = '❌';
      defaultTitle = 'Error';
    } else if (type === 'warning') {
      icon = '⚠️';
      defaultTitle = 'Warning';
    }

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title || defaultTitle}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">&times;</button>
      <div class="toast-progress"></div>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.dismiss(toast);
    });

    this.container.appendChild(toast);

    // Audio chirp if SoundFX available
    if (window.soundFX) {
      if (type === 'success') window.soundFX.hit();
      else if (type === 'error') window.soundFX.misfire();
    }

    // Auto dismiss after 4.5s
    setTimeout(() => {
      this.dismiss(toast);
    }, 4500);
  }

  dismiss(toast) {
    if (!toast || toast.classList.contains('dismissing')) return;
    toast.classList.add('dismissing');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 350);
  }
}

window.toast = new ToastNotifier();
window.showToast = (msg, type = 'info', title = null) => window.toast.show(msg, type, title);
