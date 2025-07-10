// Ensure DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

function init() {
    // DOM Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    
    // Check if canvas exists
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    const context = canvas.getContext('2d');
    const previewsContainer = document.getElementById('previews');
    const flashOverlay = document.getElementById('flash');
    const cropGuide = document.getElementById('cropGuide');
    const cameraSelect = document.getElementById('camera-select');
    const cameraSelectorContainer = document.getElementById('camera-selector-container');
    const cameraResolutionDisplay = document.getElementById('camera-resolution');
    
    // API Elements
    const apiModal = new bootstrap.Modal(document.getElementById('apiKeyModal'));
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const clearApiKeyBtn = document.getElementById('clearApiKey');
    const configureApiBtn = document.getElementById('configureApi');
    const apiStatus = document.getElementById('apiStatus');
    
    // State
    let recentPhotos = [];
    let squareSize = 0;
    let currentStream = null;
    let openaiApiKey = localStorage.getItem('openai_api_key') || '';
    
    // Initialize API status
    updateApiStatus();
    
    // API Configuration
    function updateApiStatus() {
        if (openaiApiKey) {
            apiStatus.className = 'api-status-indicator connected';
            apiStatus.textContent = 'API Connected';
        } else {
            apiStatus.className = 'api-status-indicator disconnected';
            apiStatus.textContent = 'API Not Connected';
        }
    }
    
    configureApiBtn.addEventListener('click', () => {
        apiKeyInput.value = openaiApiKey;
        apiModal.show();
    });
    
    saveApiKeyBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('openai_api_key', key);
            openaiApiKey = key;
            updateApiStatus();
            apiModal.hide();
        }
    });
    
    clearApiKeyBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the API key?')) {
            localStorage.removeItem('openai_api_key');
            openaiApiKey = '';
            apiKeyInput.value = '';
            updateApiStatus();
            apiModal.hide();
        }
    });
    
    // Get available cameras
    async function getCameras() {
        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            cameraSelect.innerHTML = '';
            
            if (videoDevices.length > 1) {
                cameraSelectorContainer.style.display = 'block';
            }
            
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            
            if (videoDevices.length > 0) {
                initWebcam(videoDevices[0].deviceId);
            }
        } catch (err) {
            console.error('Error getting cameras:', err);
            alert('Unable to access cameras. Please ensure you have granted camera permissions.');
        }
    }
    
    // Initialize webcam
    async function initWebcam(deviceId) {
        try {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            
            const constraints = {
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 3840 },
                    height: { ideal: 2160 }
                }
            };
            
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = currentStream;
            
            video.addEventListener('loadedmetadata', () => {
                updateCropGuide();
                updateResolutionDisplay();
            });
        } catch (err) {
            console.error('Error accessing webcam:', err);
        }
    }
    
    // Update resolution display
    function updateResolutionDisplay() {
        if (!currentStream || !cameraResolutionDisplay) return;
        
        const track = currentStream.getVideoTracks()[0];
        const settings = track.getSettings();
        cameraResolutionDisplay.textContent = `${settings.width}×${settings.height} @ ${settings.frameRate}fps`;
    }
    
    // Update crop guide
    function updateCropGuide() {
        const videoWidth = video.offsetWidth;
        const videoHeight = video.offsetHeight;
        squareSize = Math.min(videoWidth, videoHeight) * 0.8;
        
        cropGuide.style.width = squareSize + 'px';
        cropGuide.style.height = squareSize + 'px';
    }
    
    // Format time
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            month: 'short',
            day: 'numeric'
        });
    }
    
    // Simple fast download
    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }
    
    // Convert blob to base64
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
    
    // Analyze image with OpenAI
    async function analyzeImage(base64Image, photoIndex) {
        if (!openaiApiKey) return;
        
        const detailsContainer = document.getElementById(`details-${photoIndex}`);
        detailsContainer.innerHTML = '<div class="preview-details loading"><div class="loading-spinner"></div></div>';
        
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert at analyzing trading cards, sports cards, and collectible cards for eBay listings. Extract all visible information from the card image.'
                        },
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: `Analyze this card image and provide:
1. A compelling eBay listing title (60-80 chars, include: year, brand, player/character name, card name/number, condition indicators if visible, any special features like "Rookie", "Holo", "1st Edition", etc.)
2. Extract ALL visible details:
   - Card Set/Series
   - Card Number
   - Player/Character Name
   - Team (if applicable)
   - Year/Copyright
   - Manufacturer/Brand
   - Card Type/Rarity
   - Any special features (holographic, parallel, insert, etc.)
   - Visible condition issues
   - Any text/stats on the card

Format the response as JSON:
{
  "title": "eBay listing title here",
  "details": {
    "brand": "...",
    "year": "...",
    "setName": "...",
    "cardNumber": "...",
    "playerName": "...",
    "team": "...",
    "features": ["..."],
    "condition": "...",
    "otherInfo": "..."
  }
}`
                                },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64Image}`,
                                        detail: 'high'
                                    }
                                }
                            ]
                        }
                    ],
                    max_tokens: 500,
                    temperature: 0.3
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }
            
            const content = data.choices[0].message.content;
            const parsed = JSON.parse(content);
            
            displayCardDetails(detailsContainer, parsed);
            
        } catch (error) {
            console.error('Error analyzing image:', error);
            detailsContainer.innerHTML = `<div class="preview-error">Error: ${error.message}</div>`;
        }
    }
    
    // Display card details
    function displayCardDetails(container, data) {
        const details = data.details;
        let html = '<div class="preview-details">';
        
        // Title
        html += `<h5>${data.title}</h5>`;
        
        // Details
        if (details.brand) html += `<div class="detail-item"><strong>Brand:</strong> <span class="detail-value">${details.brand}</span></div>`;
        if (details.year) html += `<div class="detail-item"><strong>Year:</strong> <span class="detail-value">${details.year}</span></div>`;
        if (details.setName) html += `<div class="detail-item"><strong>Set:</strong> <span class="detail-value">${details.setName}</span></div>`;
        if (details.cardNumber) html += `<div class="detail-item"><strong>Card #:</strong> <span class="detail-value">${details.cardNumber}</span></div>`;
        if (details.playerName) html += `<div class="detail-item"><strong>Player:</strong> <span class="detail-value">${details.playerName}</span></div>`;
        if (details.team) html += `<div class="detail-item"><strong>Team:</strong> <span class="detail-value">${details.team}</span></div>`;
        if (details.features && details.features.length > 0) {
            html += `<div class="detail-item"><strong>Features:</strong> <span class="detail-value">${details.features.join(', ')}</span></div>`;
        }
        if (details.condition) html += `<div class="detail-item"><strong>Condition:</strong> <span class="detail-value">${details.condition}</span></div>`;
        if (details.otherInfo) html += `<div class="detail-item"><strong>Notes:</strong> <span class="detail-value">${details.otherInfo}</span></div>`;
        
        // Copy button
        html += `<button class="copy-title-btn" onclick="copyTitle('${data.title.replace(/'/g, "\\'")}', this)">Copy Title</button>`;
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    // Copy title function
    window.copyTitle = function(title, button) {
        navigator.clipboard.writeText(title).then(() => {
            button.textContent = 'Copied!';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = 'Copy Title';
                button.classList.remove('copied');
            }, 2000);
        });
    };
    
    // Capture photo - FAST VERSION
    function capturePhoto() {
        // Flash effect
        flashOverlay.classList.add('flash-animation');
        setTimeout(() => flashOverlay.classList.remove('flash-animation'), 300);
        
        // Calculate crop dimensions
        const scale = video.videoWidth / video.offsetWidth;
        const cropSize = Math.floor(squareSize * scale);
        const startX = Math.floor((video.videoWidth - cropSize) / 2);
        const startY = Math.floor((video.videoHeight - cropSize) / 2);
        
        // Set canvas to 1500x1500 (eBay standard)
        canvas.width = 1500;
        canvas.height = 1500;
        
        // Draw cropped and scaled image directly
        context.drawImage(
            video,
            startX, startY, cropSize, cropSize,  // Source
            0, 0, 1500, 1500                      // Destination
        );
        
        // Convert to blob - 95% quality is plenty for eBay
        canvas.toBlob(async function(blob) {
            const timestamp = Date.now();
            const date = new Date(timestamp);
            const filename = `ebay-${date.toISOString().split('T')[0]}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.jpg`;
            
            // Download immediately
            downloadBlob(blob, filename);
            
            // Add to previews
            const url = URL.createObjectURL(blob);
            const photoData = {
                url: url,
                blob: blob,
                timestamp: timestamp,
                filename: filename,
                index: Date.now() // Unique identifier
            };
            
            recentPhotos.unshift(photoData);
            
            // Keep only the last 4 photos
            if (recentPhotos.length > 4) {
                URL.revokeObjectURL(recentPhotos[4].url);
                recentPhotos = recentPhotos.slice(0, 4);
            }
            
            updatePreviews();
            
            // Analyze with OpenAI if API key is set
            if (openaiApiKey) {
                const base64 = await blobToBase64(blob);
                analyzeImage(base64, photoData.index);
            }
            
        }, 'image/jpeg', 0.95);
    }
    
    // Update previews
    function updatePreviews() {
        previewsContainer.innerHTML = '';
        
        recentPhotos.forEach(photo => {
            const col = document.createElement('div');
            col.className = 'col-md-3';
            
            const card = document.createElement('div');
            card.className = 'preview-card' + (openaiApiKey ? ' has-details' : '');
            
            const img = document.createElement('img');
            img.src = photo.url;
            img.className = 'preview-image';
            
            const info = document.createElement('div');
            info.className = 'preview-info';
            
            const time = document.createElement('div');
            time.className = 'preview-time';
            time.textContent = `🕒 ${formatTime(photo.timestamp)}`;
            
            const filename = document.createElement('div');
            filename.className = 'preview-filename';
            filename.textContent = photo.filename;
            
            info.appendChild(time);
            info.appendChild(filename);
            
            // Prevent info clicks from downloading
            info.addEventListener('click', (e) => e.stopPropagation());
            
            card.appendChild(img);
            card.appendChild(info);
            
            // Details container for API results
            if (openaiApiKey) {
                const detailsContainer = document.createElement('div');
                detailsContainer.id = `details-${photo.index}`;
                detailsContainer.addEventListener('click', (e) => e.stopPropagation());
                card.appendChild(detailsContainer);
            }
            
            // Click to download
            card.addEventListener('click', (e) => {
                // Don't download if clicking on copy button
                if (e.target.classList.contains('copy-title-btn')) return;
                downloadBlob(photo.blob, photo.filename);
            });
            
            col.appendChild(card);
            previewsContainer.appendChild(col);
        });
    }
    
    // Event listeners
    cameraSelect.addEventListener('change', function() {
        if (this.value) initWebcam(this.value);
    });
    
    // Spacebar to capture
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space' && e.target === document.body) {
            e.preventDefault();
            capturePhoto();
        }
    });
    
    // Resize handler
    window.addEventListener('resize', updateCropGuide);
    
    // Start
    getCameras();
}