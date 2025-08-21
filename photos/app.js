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
    
    // Toast notification function
    function showToast(title, subtitle) {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast toast-success';
        
        toast.innerHTML = `
            <span class="toast-icon">✅</span>
            <div class="toast-message">
                <div class="toast-title">${title}</div>
                ${subtitle ? `<div class="toast-subtitle">${subtitle}</div>` : ''}
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
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
        cropGuide.style.top = '50%';
        cropGuide.style.left = '50%';
        cropGuide.style.transform = 'translate(-50%, -50%)';
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
    async function analyzeImage(frontBase64, photoIndex) {
        if (!openaiApiKey) return;
        
        const detailsContainer = document.getElementById(`details-${photoIndex}`);
        detailsContainer.innerHTML = '<div class="preview-details loading"><div class="loading-spinner"></div></div>';
        
        try {
            const                 messages = [
                {
                    role: 'system',
                    content: 'You analyze trading cards, sports cards, Hot Wheels, and collectibles for eBay listings. For Hot Wheels, include the series number (like 5/5) in the title. Respond only with JSON, no other text.'
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: `Analyze this product image and create JSON for eBay listing.

Return ONLY this JSON structure with extracted information:
{
  "title": "60-80 char eBay title with year brand product/player card#/model series# features",
  "details": {
    "brand": "manufacturer name or null",
    "year": "year or null", 
    "setName": "set/series name or null",
    "cardNumber": "card/model number or null",
    "seriesNumber": "series like 5/5 or null",
    "playerName": "player/character/model name or null",
    "team": "team if applicable or null",
    "features": [],
    "condition": "condition or null",
    "otherInfo": "other info or null"
  }
}`
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${frontBase64}`,
                                detail: 'high'
                            }
                        }
                    ]
                }
            ];
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openaiApiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: messages,
                    max_tokens: 500,
                    temperature: 0.3
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error('API Error:', errorData);
                throw new Error(errorData.error?.message || `API Error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message);
            }
            
            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                console.error('Unexpected API response structure:', data);
                throw new Error('Invalid API response structure');
            }
            
            let content = data.choices[0].message.content;
            
            // Debug log
            console.log('Raw API response:', content);
            
            // Clean up the response - remove markdown code blocks if present
            content = content.trim();
            if (content.startsWith('```json')) {
                content = content.replace(/```json\s*/, '').replace(/```\s*$/, '');
            } else if (content.startsWith('```')) {
                content = content.replace(/```\s*/, '').replace(/```\s*$/, '');
            }
            
            // Try to parse the JSON
            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (parseError) {
                console.error('Failed to parse JSON:', content);
                console.error('Parse error:', parseError);
                // Try to extract any JSON from the response
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        parsed = JSON.parse(jsonMatch[0]);
                    } catch (e) {
                        throw new Error('Invalid response format from AI');
                    }
                } else {
                    throw new Error('Invalid response format from AI');
                }
            }
            
            displayCardDetails(detailsContainer, parsed);
            
        } catch (error) {
            console.error('Error analyzing image:', error);
            if (error.message.includes('Invalid response format')) {
                detailsContainer.innerHTML = `<div class="preview-error">Error: Unable to parse AI response. Check console for details.</div>`;
            } else if (error.message.includes('401')) {
                detailsContainer.innerHTML = `<div class="preview-error">Error: Invalid API key. Please check your configuration.</div>`;
            } else if (error.message.includes('429')) {
                detailsContainer.innerHTML = `<div class="preview-error">Error: Rate limit exceeded. Please try again later.</div>`;
            } else {
                detailsContainer.innerHTML = `<div class="preview-error">Error: ${error.message}</div>`;
            }
        }
    }
    
    // Display card details
    function displayCardDetails(container, data) {
        if (!data || !data.details) {
            container.innerHTML = '<div class="preview-error">Invalid data format</div>';
            return;
        }
        
        const details = data.details;
        let html = '<div class="preview-details">';
        
        // Title - auto-copy to clipboard
        if (data.title) {
            html += `<h5>${data.title}</h5>`;
            // Auto-copy title to clipboard
            navigator.clipboard.writeText(data.title).then(() => {
                showToast('Title Copied!', data.title);
            }).catch(err => {
                console.error('Failed to copy title:', err);
            });
        }
        
        // Details
        if (details.brand && details.brand !== 'null') html += `<div class="detail-item"><strong>Brand:</strong> <span class="detail-value">${details.brand}</span></div>`;
        if (details.year && details.year !== 'null') html += `<div class="detail-item"><strong>Year:</strong> <span class="detail-value">${details.year}</span></div>`;
        if (details.setName && details.setName !== 'null') html += `<div class="detail-item"><strong>Set:</strong> <span class="detail-value">${details.setName}</span></div>`;
        if (details.cardNumber && details.cardNumber !== 'null') html += `<div class="detail-item"><strong>Model/Card #:</strong> <span class="detail-value">${details.cardNumber}</span></div>`;
        if (details.seriesNumber && details.seriesNumber !== 'null') html += `<div class="detail-item"><strong>Series:</strong> <span class="detail-value">${details.seriesNumber}</span></div>`;
        if (details.playerName && details.playerName !== 'null') html += `<div class="detail-item"><strong>Name/Model:</strong> <span class="detail-value">${details.playerName}</span></div>`;
        if (details.team && details.team !== 'null') html += `<div class="detail-item"><strong>Team:</strong> <span class="detail-value">${details.team}</span></div>`;
        if (details.features && Array.isArray(details.features) && details.features.length > 0 && details.features[0] !== null) {
            const validFeatures = details.features.filter(f => f && f !== 'null');
            if (validFeatures.length > 0) {
                html += `<div class="detail-item"><strong>Features:</strong> <span class="detail-value">${validFeatures.join(', ')}</span></div>`;
            }
        }
        if (details.condition && details.condition !== 'null') html += `<div class="detail-item"><strong>Condition:</strong> <span class="detail-value">${details.condition}</span></div>`;
        if (details.otherInfo && details.otherInfo !== 'null') html += `<div class="detail-item"><strong>Notes:</strong> <span class="detail-value">${details.otherInfo}</span></div>`;
        
        html += '</div>';
        container.innerHTML = html;
    }
    
    
    
    // Capture photo - FAST VERSION
    function capturePhoto(performAnalysis = true) {
        // Flash effect
        flashOverlay.classList.add('flash-animation');
        setTimeout(() => flashOverlay.classList.remove('flash-animation'), 300);
        
        // Simple approach: The crop guide is 80% of min dimension and centered
        // We just need to crop the same percentage from the center of the actual video
        
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        // Calculate the size of the square crop (80% of the smaller video dimension)
        const cropPercent = 0.8;
        const cropSize = Math.floor(Math.min(videoWidth, videoHeight) * cropPercent);
        
        // Center the crop
        const cropX = Math.floor((videoWidth - cropSize) / 2);
        const cropY = Math.floor((videoHeight - cropSize) / 2);
        
        console.log('Crop info:', {
            video: `${videoWidth}x${videoHeight}`,
            cropSize: cropSize,
            cropPos: `${cropX},${cropY}`
        });
        
        // Set canvas to 1500x1500 (eBay standard)
        canvas.width = 1500;
        canvas.height = 1500;
        
        // Draw cropped and scaled image directly
        context.drawImage(
            video,
            cropX, cropY, cropSize, cropSize,  // Source (80% square from center)
            0, 0, 1500, 1500                    // Destination (1500x1500 output)
        );
        
        // Convert to blob - 95% quality is plenty for eBay
        canvas.toBlob(async function(blob) {
            const timestamp = Date.now();
            const date = new Date(timestamp);
            const filename = `ebay-${date.toISOString().split('T')[0]}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.jpg`;
            
            // Download immediately
            downloadBlob(blob, filename);
            
            // Convert front to base64 for API
            const frontBase64 = await blobToBase64(blob);
            
            // Add to previews
            const url = URL.createObjectURL(blob);
            const photoData = {
                url: url,
                blob: blob,
                timestamp: timestamp,
                filename: filename,
                index: Date.now(), // Unique identifier
                frontBase64: frontBase64
            };
            
            recentPhotos.unshift(photoData);
            
            // Keep only the last 4 photos
            if (recentPhotos.length > 4) {
                URL.revokeObjectURL(recentPhotos[4].url);
                recentPhotos = recentPhotos.slice(0, 4);
            }
            
            updatePreviews();
            
            // Analyze with OpenAI if API key is set AND analysis is requested
            if (openaiApiKey && performAnalysis) {
                analyzeImage(frontBase64, photoData.index);
            }
            
        }, 'image/jpeg', 0.95);
    }
    
    // Update previews
    function updatePreviews() {
        previewsContainer.innerHTML = '';
        
        recentPhotos.forEach(photo => {
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
            
            
            previewsContainer.appendChild(card);
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
            // Shift+Space = capture with AI analysis (if API key exists)
            // Space only = just capture, no analysis
            const performAnalysis = e.shiftKey && openaiApiKey;
            capturePhoto(performAnalysis);
        }
    });
    
    // Resize handler
    window.addEventListener('resize', updateCropGuide);
    
    // Start
    getCameras();
}