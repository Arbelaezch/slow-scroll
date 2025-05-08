// Global settings
const DEFAULT_DELAY = 5000; // 5 seconds delay

console.log('[SlowScroll] Extension background script loaded');

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SlowScroll] Extension installed or updated');
  
  chrome.storage.local.get(['slowSites', 'isEnabled', 'delay'], (result) => {
    if (!result.slowSites) {
      console.log('[SlowScroll] Initializing default settings');
      chrome.storage.local.set({ 
        slowSites: [],
        isEnabled: true,
        delay: DEFAULT_DELAY
      });
    } else {
      console.log('[SlowScroll] Existing settings found:', result);
    }
  });
});

// Track which navigations we've already processed
const processedNavigations = new Map();

// Clean up old navigation entries (older than 10 seconds)
function cleanupNavigationTracker() {
  console.log('[SlowScroll] Cleaning up navigation tracker');
  
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [key, timestamp] of processedNavigations.entries()) {
    if (now - timestamp > 10000) {
      processedNavigations.delete(key);
      deletedCount++;
    }
  }
  
  console.log(`[SlowScroll] Removed ${deletedCount} old navigation entries, ${processedNavigations.size} remain`);
}

// Helper function to check if a URL should be delayed
function shouldDelayUrl(url) {
  console.log(`[SlowScroll] Checking if URL should be delayed: ${url}`);
  
  return new Promise(resolve => {
    if (!url) {
      console.log('[SlowScroll] No URL provided, not delaying');
      resolve(false);
      return;
    }
    
    try {
      const hostname = new URL(url).hostname;
      console.log(`[SlowScroll] Hostname: ${hostname}`);
      
      chrome.storage.local.get(['slowSites', 'isEnabled'], (result) => {
        if (!result.isEnabled) {
          console.log('[SlowScroll] Extension is disabled, not delaying');
          resolve(false);
          return;
        }
        
        const slowSites = result.slowSites || [];
        console.log(`[SlowScroll] Checking against ${slowSites.length} slow sites:`, slowSites);
        
        const shouldDelay = slowSites.some(site => 
          hostname.includes(site) || site.includes(hostname)
        );
        
        console.log(`[SlowScroll] Should delay: ${shouldDelay}`);
        resolve(shouldDelay);
      });
    } catch (e) {
      console.error('[SlowScroll] Error parsing URL:', e);
      resolve(false);
    }
  });
}

// Listen for tab updates - this catches both initial page load and subsequent navigations
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  console.log(`[SlowScroll] Tab updated - Tab ID: ${tabId}, Status: ${changeInfo.status}, URL: ${tab.url}`);
  
  // Only act when the page is starting to load
  if (changeInfo.status === 'loading' && tab.url) {
    console.log(`[SlowScroll] Tab is loading: ${tab.url}`);
    const shouldDelay = await shouldDelayUrl(tab.url);
    
    if (shouldDelay) {
      console.log(`[SlowScroll] Should delay URL: ${tab.url}`);
      
      // Create a unique key for this navigation
      const navigationKey = `${tabId}-${tab.url}`;
      
      // Check if we've already processed this navigation recently
      if (processedNavigations.has(navigationKey)) {
        console.log(`[SlowScroll] Already processed navigation: ${navigationKey}, skipping`);
        return;
      }
      
      // Mark this navigation as processed
      processedNavigations.set(navigationKey, Date.now());
      console.log(`[SlowScroll] Marked navigation as processed: ${navigationKey}`);
      
      // Clean up old entries
      cleanupNavigationTracker();
      
      // Get the configured delay time
      chrome.storage.local.get(['delay'], (result) => {
        const delay = result.delay || DEFAULT_DELAY;
        console.log(`[SlowScroll] Using delay of ${delay}ms`);
        
        // Check if this is YouTube Shorts
        const isYouTubeShorts = tab.url && tab.url.includes('youtube.com/shorts');
        console.log(`[SlowScroll] Is YouTube Shorts: ${isYouTubeShorts}`);
        
        // Inject our unified delay function
        console.log(`[SlowScroll] Injecting delay function for tab ${tabId}`);
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          function: injectDelayOverlay,
          args: [delay, isYouTubeShorts]
        }).then(() => {
          console.log(`[SlowScroll] Successfully injected script for tab ${tabId}`);
        }).catch(err => {
          console.error(`[SlowScroll] Error injecting script for tab ${tabId}:`, err);
        });
      });
    } else {
      console.log(`[SlowScroll] Not delaying URL: ${tab.url}`);
    }
  }
});

// Also listen for SPA navigation
// chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
//   console.log(`[SlowScroll] History state updated - Tab ID: ${details.tabId}, URL: ${details.url}`);
  
//   // Only for main frame
//   if (details.frameId !== 0 || !details.url) {
//     console.log(`[SlowScroll] Not main frame or no URL, ignoring`);
//     return;
//   }
  
//   const shouldDelay = await shouldDelayUrl(details.url);
  
//   if (shouldDelay) {
//     console.log(`[SlowScroll] Should delay SPA navigation: ${details.url}`);
    
//     // Create a unique key for this navigation
//     const navigationKey = `${details.tabId}-${details.url}`;
    
//     // Check if we've already processed this navigation recently
//     if (processedNavigations.has(navigationKey)) {
//       console.log(`[SlowScroll] Already processed SPA navigation: ${navigationKey}, skipping`);
//       return;
//     }
    
//     // Mark this navigation as processed
//     processedNavigations.set(navigationKey, Date.now());
//     console.log(`[SlowScroll] Marked SPA navigation as processed: ${navigationKey}`);
    
//     // Clean up old entries
//     cleanupNavigationTracker();
    
//     // Get the configured delay time
//     chrome.storage.local.get(['delay'], (result) => {
//       const delay = result.delay || DEFAULT_DELAY;
//       console.log(`[SlowScroll] Using delay of ${delay}ms for SPA navigation`);
      
//       // Check if this is YouTube Shorts
//       const isYouTubeShorts = details.url && details.url.includes('youtube.com/shorts');
//       console.log(`[SlowScroll] Is YouTube Shorts SPA: ${isYouTubeShorts}`);
      
//       // Inject our unified delay function
//       console.log(`[SlowScroll] Injecting delay function for SPA tab ${details.tabId}`);
//       chrome.scripting.executeScript({
//         target: { tabId: details.tabId },
//         function: injectDelayOverlay,
//         args: [delay, isYouTubeShorts]
//       }).then(() => {
//         console.log(`[SlowScroll] Successfully injected script for SPA tab ${details.tabId}`);
//       }).catch(err => {
//         console.error(`[SlowScroll] Error injecting script for SPA tab ${details.tabId}:`, err);
//       });
//     });
//   } else {
//     console.log(`[SlowScroll] Not delaying SPA URL: ${details.url}`);
//   }
// });

// Unified function that handles both regular and SPA navigation
function injectDelayOverlay(delay, isYouTubeShorts) {
  console.log(`[SlowScroll-Page] Starting injectDelayOverlay - Delay: ${delay}ms, YouTube Shorts: ${isYouTubeShorts}`);
  
//   // Only run once per page
//   const overlayId = 'slowscroll-overlay';
//   if (document.getElementById(overlayId)) {
//     console.log('[SlowScroll-Page] Overlay already exists, not creating another one');
//     return;
//   }
  
//   console.log(`[SlowScroll-Page] Current URL: ${window.location.href}`);
  
//   // Create our overlay immediately to block content
//   const overlay = document.createElement('div');
//   overlay.id = overlayId;
//   overlay.style.position = 'fixed';
//   overlay.style.top = '0';
//   overlay.style.left = '0';
//   overlay.style.width = '100%';
//   overlay.style.height = '100%';
//   overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
//   overlay.style.zIndex = '2147483647'; // Maximum z-index value
//   overlay.style.display = 'flex';
//   overlay.style.justifyContent = 'center';
//   overlay.style.alignItems = 'center';
//   overlay.style.flexDirection = 'column';
  
//   const spinner = document.createElement('div');
//   spinner.style.border = '5px solid #f3f3f3';
//   spinner.style.borderTop = '5px solid #3498db';
//   spinner.style.borderRadius = '50%';
//   spinner.style.width = '50px';
//   spinner.style.height = '50px';
//   spinner.style.animation = 'slowscrollspin 2s linear infinite';
  
//   const message = document.createElement('p');
//   message.textContent = 'Loading...';
//   message.style.marginTop = '20px';
//   message.style.fontFamily = 'Arial, sans-serif';
//   message.style.fontSize = '16px';
  
//   // Add the style for the spinner animation
//   const style = document.createElement('style');
//   style.textContent = `
//     @keyframes slowscrollspin {
//       0% { transform: rotate(0deg); }
//       100% { transform: rotate(360deg); }
//     }
//   `;
  
//   console.log('[SlowScroll-Page] Handling page visibility and interactions');
  
//   // Different approach depending on if it's YouTube Shorts or regular page
//   if (!isYouTubeShorts) {
//     // For regular sites, hide content completely if not an SPA
//     // Check if this appears to be an SPA by looking for common SPA frameworks
//     const isSPA = document.querySelector('angular') || 
//                  document.querySelector('react') || 
//                  document.querySelector('#app') ||
//                  document.querySelector('#root') ||
//                  document.querySelector('[ng-app]') ||
//                  document.querySelector('[data-reactroot]');
    
//     console.log(`[SlowScroll-Page] Detected as SPA: ${!!isSPA}`);
    
//     if (!isSPA && document.documentElement) {
//       console.log('[SlowScroll-Page] Hiding document content');
//       document.documentElement.style.display = 'none';
//     }
//   } else {
//     // For YouTube Shorts, we need a special approach to block element access
//     console.log('[SlowScroll-Page] Adding YouTube Shorts interaction blocker');
    
//     // Add a style to disable pointer events on everything except our overlay
//     const blockInteractions = document.createElement('style');
//     blockInteractions.id = 'slowscroll-block-interactions';
//     blockInteractions.textContent = `
//       body * {
//         pointer-events: none !important;
//       }
//       #${overlayId} {
//         pointer-events: auto !important;
//       }
//     `;
//     document.head.appendChild(blockInteractions);
//   }
  
//   // Add elements to the DOM
//   console.log('[SlowScroll-Page] Adding overlay elements to DOM');
//   document.head.appendChild(style);
//   overlay.appendChild(spinner);
//   overlay.appendChild(message);
  
//   if (document.body) {
//     document.body.appendChild(overlay);
//     console.log('[SlowScroll-Page] Added overlay to body');
//   } else {
//     document.documentElement.appendChild(overlay);
//     console.log('[SlowScroll-Page] Added overlay to documentElement (no body available)');
//   }
  
//   // Track the media elements we've already processed
//   const processedMedia = new WeakSet();
  
//   // Function to close any miniplayers (YouTube specific)
//   function closeMiniPlayers() {
//     if (!isYouTubeShorts) return;
    
//     console.log('[SlowScroll-Page] Attempting to close any miniplayers');
    
//     // Try every selector that might match miniplayer close buttons
//     const selectors = [
//       '.ytp-miniplayer-close-button',
//       'button[aria-label="Exit miniplayer"]',
//       'button[title="Exit miniplayer"]',
//       '.ytp-miniplayer-button[aria-expanded="true"]'
//     ];
    
//     let foundButtons = 0;
//     selectors.forEach(selector => {
//       const buttons = document.querySelectorAll(selector);
//       foundButtons += buttons.length;
      
//       buttons.forEach(button => {
//         try {
//           button.click();
//           console.log(`[SlowScroll-Page] Clicked miniplayer close button: ${selector}`);
//         } catch (e) {
//           console.error(`[SlowScroll-Page] Error closing miniplayer with selector ${selector}:`, e);
//         }
//       });
//     });
    
//     // Try to find and hide any miniplayer elements directly
//     const miniplayerElements = document.querySelectorAll('.ytp-miniplayer-ui, ytd-miniplayer, [id*="miniplayer"]');
//     console.log(`[SlowScroll-Page] Found ${miniplayerElements.length} miniplayer elements to hide`);
    
//     miniplayerElements.forEach(element => {
//       try {
//         element.style.display = 'none';
//         console.log('[SlowScroll-Page] Hid miniplayer element');
//       } catch (e) {
//         console.error('[SlowScroll-Page] Error hiding miniplayer element:', e);
//       }
//     });
    
//     console.log(`[SlowScroll-Page] Finished miniplayer check: found ${foundButtons} close buttons`);
//   }
  
//   // Function to handle media elements
//   function handleMedia() {
//     const videos = document.querySelectorAll('video');
//     const audios = document.querySelectorAll('audio');
    
//     console.log(`[SlowScroll-Page] Found ${videos.length} videos and ${audios.length} audio elements`);
//     console.log('videos:', videos);
    
    
//     // Process both types of media
//     [videos, audios].forEach(mediaList => {
//       mediaList.forEach(media => {
//         // Only process each media element once
//         if (!processedMedia.has(media)) {
//           try {
//             console.log(`[SlowScroll-Page] Processing new media element:`, {
//               tagName: media.tagName,
//               id: media.id,
//               src: media.src ? media.src.substring(0, 50) + '...' : '(no src)',
//               paused: media.paused,
//               muted: media.muted,
//               volume: media.volume,
//               duration: media.duration
//             });
            
//             // Store original state before modifying
//             media.__originalState = {
//               paused: media.paused,
//               muted: media.muted,
//               volume: media.volume,
//               currentTime: media.currentTime
//             };
            
//             // Ensure media is paused and muted during the delay
//             if (!media.paused) {
//               console.log('[SlowScroll-Page] Pausing playing media');
//               media.pause();
//             }
            
//             if (!media.muted) {
//               console.log('[SlowScroll-Page] Muting unmuted media');
//               media.muted = true;
//             }
            
//             processedMedia.add(media);
//           } catch (e) {
//             console.error('[SlowScroll-Page] Error handling media element:', e);
//           }
//         } else {
//           // For already processed media, just make sure it stays paused
//           if (!media.paused) {
//             media.pause();
//           }
//         }
//       });
//     });
    
//     // For YouTube specifically, try to pause via player buttons too
//     if (isYouTubeShorts) {
//       const playButtons = document.querySelectorAll('.ytp-play-button');
//       console.log(`[SlowScroll-Page] Found ${playButtons.length} play buttons`);
      
//       playButtons.forEach(button => {
//         try {
//           if (button.title && button.title.toLowerCase().includes('pause')) {
//             console.log('[SlowScroll-Page] Clicking pause button');
//             button.click();
//           }
//         } catch (e) {
//           console.error('[SlowScroll-Page] Error clicking pause button:', e);
//         }
//       });
      
//       // Also try to close any miniplayers
//       closeMiniPlayers();
//     }
//   }
  
//   // Handle media immediately
//   console.log('[SlowScroll-Page] Initial media handling pass');
//   handleMedia();
  
//   // Keep checking for new media elements during the delay
//   console.log('[SlowScroll-Page] Setting up media monitoring interval');
//   const mediaInterval = setInterval(() => {
//     handleMedia();
//   }, 100);
  
//   // For YouTube Shorts, try to close miniplayers periodically
//   let miniplayerInterval = null;
//   if (isYouTubeShorts) {
//     console.log('[SlowScroll-Page] Setting up miniplayer monitoring interval');
//     miniplayerInterval = setInterval(closeMiniPlayers, 500);
//   }
  
//   // Set a timeout to remove the overlay after the delay
//   console.log(`[SlowScroll-Page] Setting timeout to remove overlay after ${delay}ms`);
//   setTimeout(() => {
//     console.log('[SlowScroll-Page] Delay completed, beginning cleanup');
    
//     // Stop checking for media
//     clearInterval(mediaInterval);
//     console.log('[SlowScroll-Page] Cleared media monitoring interval');
    
//     if (miniplayerInterval) {
//       clearInterval(miniplayerInterval);
//       console.log('[SlowScroll-Page] Cleared miniplayer monitoring interval');
//     }
    
//     // One last check for miniplayers
//     if (isYouTubeShorts) {
//       closeMiniPlayers();
//     }
    
//     // Remove interaction blocker if it exists
//     const blockInteractions = document.getElementById('slowscroll-block-interactions');
//     if (blockInteractions) {
//       blockInteractions.remove();
//       console.log('[SlowScroll-Page] Removed interaction blocker');
//     }
    
//     // Show content again if we hid it
//     if (document.documentElement && document.documentElement.style.display === 'none') {
//       document.documentElement.style.display = '';
//       console.log('[SlowScroll-Page] Re-enabled document visibility');
//     }
    
//     // Remove the overlay
//     const existingOverlay = document.getElementById(overlayId);
//     if (existingOverlay) {
//       existingOverlay.remove();
//       console.log('[SlowScroll-Page] Removed overlay');
//     }
    
//     console.log('[SlowScroll-Page] Restoring media state');
    
//     // Restore media state - this is crucial for YouTube Shorts
//     let restoredMediaCount = 0;
//     document.querySelectorAll('video, audio').forEach(media => {
//       if (media.__originalState) {
//         try {
//           console.log('[SlowScroll-Page] Restoring media element to original state:', {
//             wasMuted: media.__originalState.muted,
//             wasVolume: media.__originalState.volume
//           });
          
//           // Restore muted state and volume
//           media.muted = media.__originalState.muted;
//           media.volume = media.__originalState.volume;
          
//           // Remove our saved state
//           delete media.__originalState;
//           restoredMediaCount++;
//         } catch (e) {
//           console.error('[SlowScroll-Page] Error restoring media state:', e);
//         }
//       }
//     });
    
//     console.log(`[SlowScroll-Page] Restored ${restoredMediaCount} media elements`);
    
//     // Special case for YouTube Shorts - activate the player
//     if (isYouTubeShorts) {
//       console.log('[SlowScroll-Page] Starting YouTube Shorts specific activation');
      
//       // Immediately try to activate the player - no delay here
//       // This is critical to fix the audio delay issue
//       const videos = document.querySelectorAll('video');
//       console.log(`[SlowScroll-Page] Found ${videos.length} videos to activate`);
      
//       videos.forEach((video, index) => {
//         try {
//           console.log(`[SlowScroll-Page] Activating video ${index}`);
          
//           // Try clicking it to activate
//           video.click();
//           console.log(`[SlowScroll-Page] Clicked video ${index}`);
          
//           // Try to move the mouse over it to show controls
//           const rect = video.getBoundingClientRect();
//           console.log(`[SlowScroll-Page] Video ${index} dimensions:`, {
//             width: rect.width,
//             height: rect.height,
//             top: rect.top,
//             left: rect.left
//           });
          
//           const event = new MouseEvent('mousemove', {
//             view: window,
//             bubbles: true,
//             cancelable: true,
//             clientX: rect.left + rect.width / 2,
//             clientY: rect.top + rect.height / 2
//           });
//           video.dispatchEvent(event);
//           console.log(`[SlowScroll-Page] Dispatched mousemove event to video ${index}`);
//         } catch (e) {
//           console.error(`[SlowScroll-Page] Error activating video ${index}:`, e);
//         }
//       });
      
//       // Also try clicking container elements
//       const containers = document.querySelectorAll('ytd-shorts, .html5-video-container, .html5-video-player, #shorts-container');
//       console.log(`[SlowScroll-Page] Found ${containers.length} container elements`);
      
//       containers.forEach((container, index) => {
//         try {
//           console.log(`[SlowScroll-Page] Clicking container ${index}`);
//           container.click();
//         } catch (e) {
//           console.error(`[SlowScroll-Page] Error clicking container ${index}:`, e);
//         }
//       });
      
//       // Click any play buttons
//       const playButtons = document.querySelectorAll('.ytp-play-button');
//       console.log(`[SlowScroll-Page] Found ${playButtons.length} play buttons`);
      
//       playButtons.forEach((button, index) => {
//         try {
//           if (button.title && button.title.toLowerCase().includes('play')) {
//             console.log(`[SlowScroll-Page] Clicking play button ${index}`);
//             button.click();
//           } else {
//             console.log(`[SlowScroll-Page] Button ${index} is not a play button (title: "${button.title}")`);
//           }
//         } catch (e) {
//           console.error(`[SlowScroll-Page] Error clicking play button ${index}:`, e);
//         }
//       });
//     }
    
//     // Set up a longer-term miniplayer observer for YouTube to prevent 
//     // background audio from returning after 30 seconds
//     if (isYouTubeShorts) {
//       console.log('[SlowScroll-Page] Setting up long-term miniplayer observer');
      
//       // Create a MutationObserver to detect and handle miniplayers that appear later
//       const miniplayerObserver = new MutationObserver((mutations) => {
//         // Check for added nodes that might be miniplayers
//         for (const mutation of mutations) {
//           if (mutation.addedNodes && mutation.addedNodes.length) {
//             let shouldCheckMiniPlayers = false;
            
//             for (const node of mutation.addedNodes) {
//               if (node.nodeType === 1 && ( // Element node
//                 (node.classList && (
//                   node.classList.contains('ytp-miniplayer-ui') ||
//                   node.classList.contains('ytd-miniplayer')
//                 )) ||
//                 (node.id && node.id.includes('miniplayer')) ||
//                 (node.tagName && node.tagName.toLowerCase() === 'ytd-miniplayer')
//               )) {
//                 console.log('[SlowScroll-Page] Mutation observer detected miniplayer element:', node);
//                 shouldCheckMiniPlayers = true;
//                 break;
//               }
//             }
            
//             if (shouldCheckMiniPlayers) {
//               console.log('[SlowScroll-Page] Mutation observer triggering miniplayer check');
//               closeMiniPlayers();
//             }
//           }
//         }
//       });
      
//       // Start observing the document for miniplayer elements
//       miniplayerObserver.observe(document.documentElement, { 
//         childList: true, 
//         subtree: true 
//       });
//       console.log('[SlowScroll-Page] Miniplayer observer started');
      
//       // Store the observer so it persists
//       window.__slowScrollMiniplayerObserver = miniplayerObserver;
      
//       // Set a timeout to disconnect it after 5 minutes to avoid memory usage
//       setTimeout(() => {
//         if (window.__slowScrollMiniplayerObserver) {
//           window.__slowScrollMiniplayerObserver.disconnect();
//           window.__slowScrollMiniplayerObserver = null;
//           console.log('[SlowScroll-Page] Disconnected miniplayer observer after timeout');
//         }
//       }, 300000); // 5 minutes
//     }
    
//     console.log('[SlowScroll-Page] Delay handling complete');
//   }, delay);
}