// This script runs on all pages
// We use this to intercept link clicks and add delays

// Keep track of when the last delay was applied
let lastDelayTime = 0;

// Function to check if a URL should be slowed down
function shouldSlowDown(url) {
  return new Promise(resolve => {
    const hostname = new URL(url).hostname;
    chrome.storage.local.get(['slowSites', 'isEnabled'], result => {
      if (!result.isEnabled) {
        resolve(false);
        return;
      }
      
      const shouldSlow = result.slowSites.some(site => 
        hostname.includes(site) || site.includes(hostname)
      );
      resolve(shouldSlow);
    });
  });
}

// Intercept all link clicks
document.addEventListener('click', async (e) => {
  // Don't handle clicks too close together (within 1 second)
  const now = Date.now();
  if (now - lastDelayTime < 1000) return;
  
  // Find if the click was on a link or within a link
  let target = e.target;
  while (target && target.tagName !== 'A') {
    target = target.parentElement;
    if (!target) return;
  }
  
  const href = target.href;
  if (!href || href.startsWith('javascript:')) return;
  
  // Check if this site should be slowed down
  const shouldSlow = await shouldSlowDown(href);
  if (shouldSlow) {
    lastDelayTime = now;
    e.preventDefault();
    
    chrome.storage.local.get(['delay'], result => {
      const delay = result.delay || 5000;
      
      // Create loading overlay
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
      overlay.style.zIndex = '9999';
      overlay.style.display = 'flex';
      overlay.style.justifyContent = 'center';
      overlay.style.alignItems = 'center';
      overlay.style.flexDirection = 'column';
      
      const spinner = document.createElement('div');
      spinner.style.border = '5px solid #f3f3f3';
      spinner.style.borderTop = '5px solid #3498db';
      spinner.style.borderRadius = '50%';
      spinner.style.width = '50px';
      spinner.style.height = '50px';
      spinner.style.animation = 'spin 2s linear infinite';
      
      const message = document.createElement('p');
      message.textContent = 'Slowing Scroll...';
      message.style.marginTop = '20px';
      message.style.fontFamily = 'Arial, sans-serif';
      
      // Add the style for the spinner animation
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      
      document.head.appendChild(style);
      overlay.appendChild(spinner);
      overlay.appendChild(message);
      document.body.appendChild(overlay);
      
      // Navigate after delay
      setTimeout(() => {
        window.location.href = href;
      }, delay);
    });
  }
});