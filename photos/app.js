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
    const cameraLoading = document.getElementById('cameraLoading');
    const qualitySelect = document.getElementById('quality-select');
    
    // API Elements
    const apiModal = document.getElementById('apiKeyModal');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const configureApiBtn = document.getElementById('configureApi');
    const apiStatus = document.getElementById('apiStatus');
    
    // State
    let recentPhotos = [];
    let squareSize = 0;
    let currentStream = null;
    let openaiApiKey = localStorage.getItem('openai_api_key') || '';
    let imageWorker = null;
    
    // Load saved preferences
    let savedCameraId = localStorage.getItem('preferred_camera') || '';
    let savedQuality = localStorage.getItem('preferred_quality') || 'balanced';
    
    // Initialize Web Worker for image processing
    try {
        imageWorker = new Worker('image-worker.js');
    } catch (err) {
        console.warn('Web Worker not available, falling back to main thread processing');
    }
    
    // Initialize API status
    updateApiStatus();
    
    // Set saved quality preference
    if (qualitySelect && savedQuality) {
        qualitySelect.value = savedQuality;
    }
    
    // Initialize photo counter
    updatePhotoCounter();
    
    // Toast notification function
    function showToast(title, subtitle) {
        const toastContainer = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = 'toast-enter flex items-center gap-3 bg-gray-800 border-l-4 border-green-500 rounded-lg p-4 shadow-xl max-w-md';
        
        toast.innerHTML = `
            <span class="text-2xl">✅</span>
            <div class="flex-1">
                <div class="font-semibold text-green-400">${title}</div>
                ${subtitle ? `<div class="text-sm text-gray-300 mt-1">${subtitle}</div>` : ''}
            </div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove after 4 seconds
        setTimeout(() => {
            toast.classList.remove('toast-enter');
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
    
    // API Configuration
    function updateApiStatus() {
        if (openaiApiKey) {
            apiStatus.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-green-900/30 text-green-400';
            apiStatus.innerHTML = '<span class="w-2 h-2 bg-green-400 rounded-full"></span>API Connected';
        } else {
            apiStatus.className = 'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm bg-red-900/30 text-red-400';
            apiStatus.innerHTML = '<span class="w-2 h-2 bg-red-400 rounded-full"></span>API Not Connected';
        }
    }
    
    // Modal functions
    window.openModal = function() {
        apiKeyInput.value = openaiApiKey;
        apiModal.classList.remove('hidden');
    }
    
    window.closeModal = function() {
        apiModal.classList.add('hidden');
    }
    
    window.saveApiKey = function() {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('openai_api_key', key);
            openaiApiKey = key;
            updateApiStatus();
            closeModal();
        }
    }
    
    window.clearApiKey = function() {
        if (confirm('Are you sure you want to clear the API key?')) {
            localStorage.removeItem('openai_api_key');
            openaiApiKey = '';
            apiKeyInput.value = '';
            updateApiStatus();
            closeModal();
        }
    }
    
    configureApiBtn.addEventListener('click', openModal);
    
    // Get available cameras
    async function getCameras() {
        try {
            await navigator.mediaDevices.getUserMedia({ video: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            cameraSelect.innerHTML = '';
            
            if (videoDevices.length > 1) {
                cameraSelectorContainer.classList.remove('hidden');
            }
            
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
                console.log(`Camera ${index}:`, device.label, device.deviceId);
            });
            
            if (videoDevices.length > 0) {
                let preferredCamera;
                
                // First check if we have a saved camera preference
                if (savedCameraId) {
                    preferredCamera = videoDevices.find(d => d.deviceId === savedCameraId);
                }
                
                // If no saved preference or saved camera not found, use defaults
                if (!preferredCamera) {
                    // Try OBSBOT first for 4K, then fall back to others
                    const obsbot = videoDevices.find(d => d.label && d.label.includes('OBSBOT Meet 2'));
                    const brio = videoDevices.find(d => d.label && d.label.includes('Logitech BRIO'));
                    preferredCamera = obsbot || brio || videoDevices[0];
                }
                
                initWebcam(preferredCamera.deviceId);
                
                // Set the dropdown to match
                cameraSelect.value = preferredCamera.deviceId;
            }
        } catch (err) {
            console.error('Error getting cameras:', err);
            alert('Unable to access cameras. Please ensure you have granted camera permissions.');
        }
    }
    
    // Get quality preset settings
    function getQualitySettings(preset) {
        switch (preset) {
            case 'fast':
                return [
                    { width: 1280, height: 720 },
                    { width: { ideal: 1280 }, height: { ideal: 720 } }
                ];
            case 'quality':
                return [
                    { width: { exact: 3840 }, height: { exact: 2160 } },
                    { width: 3840, height: 2160 },
                    { width: { min: 1920, ideal: 3840 }, height: { min: 1080, ideal: 2160 } }
                ];
            case 'balanced':
            default:
                return [
                    { width: 1920, height: 1080 },
                    { width: { ideal: 1920 }, height: { ideal: 1080 } },
                    { width: { min: 1280, ideal: 1920 }, height: { min: 720, ideal: 1080 } }
                ];
        }
    }
    
    // Initialize webcam with optimized constraints
    async function initWebcam(deviceId) {
        try {
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            
            // Get quality preset (use saved preference or current selection)
            const quality = qualitySelect ? qualitySelect.value : savedQuality;
            const resolutions = getQualitySettings(quality);
            
            let stream = null;
            for (const res of resolutions) {
                try {
                    const constraints = {
                        video: {
                            deviceId: deviceId ? { exact: deviceId } : undefined,
                            ...res
                        }
                    };
                    console.log('Trying constraints:', constraints);
                    stream = await navigator.mediaDevices.getUserMedia(constraints);
                    break; // Success, stop trying
                } catch (err) {
                    console.log('Failed with:', res, err.message);
                    continue;
                }
            }
            
            if (!stream) {
                throw new Error('Could not initialize camera with any resolution');
            }
            
            currentStream = stream;
            video.srcObject = currentStream;
            
            // Log what we actually got
            const track = currentStream.getVideoTracks()[0];
            const settings = track.getSettings();
            console.log('Camera settings:', settings);
            
            // Save the successfully initialized camera
            if (deviceId) {
                localStorage.setItem('preferred_camera', deviceId);
            }
            
            // Remove any existing listeners first
            video.onloadedmetadata = () => {
                // Hide loading spinner
                if (cameraLoading) {
                    cameraLoading.style.display = 'none';
                }
                updateCropGuide();
                updateResolutionDisplay();
            };
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
    
    // Batch download all photos
    function downloadAllPhotos() {
        if (recentPhotos.length === 0) {
            showToast('No photos to download', 'Capture some photos first');
            return;
        }
        
        recentPhotos.forEach((photo, index) => {
            if (photo.blob) {
                // Stagger downloads slightly to avoid browser blocking
                setTimeout(() => {
                    downloadBlob(photo.blob, photo.filename);
                }, index * 200);
            }
        });
        
        showToast('Downloading Photos', `Downloading ${recentPhotos.length} photo${recentPhotos.length > 1 ? 's' : ''}`);
    }
    
    // Make downloadAllPhotos globally accessible
    window.downloadAllPhotos = downloadAllPhotos;
    
    // Clear all photos
    function clearAllPhotos() {
        if (recentPhotos.length === 0) {
            showToast('No photos to clear', '');
            return;
        }
        
        if (confirm(`Clear all ${recentPhotos.length} photos?`)) {
            // Clean up resources
            recentPhotos.forEach(photo => {
                if (photo.url) URL.revokeObjectURL(photo.url);
                delete photo.frontBase64;
                delete photo.blob;
                delete photo.analysisData;
            });
            
            // Clear array and update UI
            recentPhotos = [];
            updatePreviews();
            showToast('All photos cleared', '');
        }
    }
    
    // Copy all titles
    function copyAllTitles() {
        const titles = recentPhotos
            .filter(p => p.analysisData && p.analysisData.title)
            .map(p => p.analysisData.title);
        
        if (titles.length === 0) {
            showToast('No titles to copy', 'Run AI analysis first');
            return;
        }
        
        const allTitles = titles.join('\n');
        navigator.clipboard.writeText(allTitles).then(() => {
            showToast('All Titles Copied! ✅', `${titles.length} title${titles.length > 1 ? 's' : ''} copied`);
        }).catch(err => {
            console.error('Failed to copy titles:', err);
            showToast('⚠️ Copy Failed', 'Please copy manually');
        });
    }
    
    // Make functions globally accessible
    window.clearAllPhotos = clearAllPhotos;
    window.copyAllTitles = copyAllTitles;
    
    // Convert blob to base64 with size optimization
    function blobToBase64(blob, maxWidth = 1000) {
        return new Promise((resolve, reject) => {
            // Use Web Worker if available
            if (imageWorker) {
                const messageHandler = (e) => {
                    imageWorker.removeEventListener('message', messageHandler);
                    if (e.data.success) {
                        resolve(e.data.base64);
                    } else {
                        reject(new Error(e.data.error));
                    }
                };
                imageWorker.addEventListener('message', messageHandler);
                imageWorker.postMessage({ blob, maxWidth });
            } else {
                // Fallback to main thread processing
                // If blob is small enough, convert directly
                if (blob.size < 500000) { // Less than 500KB
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                } else {
                    // For larger images, resize first
                    const img = new Image();
                    const url = URL.createObjectURL(blob);
                    img.onload = () => {
                        const aspectRatio = img.height / img.width;
                        const newWidth = Math.min(maxWidth, img.width);
                        const newHeight = newWidth * aspectRatio;
                        
                        const resizeCanvas = document.createElement('canvas');
                        resizeCanvas.width = newWidth;
                        resizeCanvas.height = newHeight;
                        const ctx = resizeCanvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, newWidth, newHeight);
                        
                        resizeCanvas.toBlob((resizedBlob) => {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                                URL.revokeObjectURL(url);
                                resolve(reader.result.split(',')[1]);
                            };
                            reader.onerror = reject;
                            reader.readAsDataURL(resizedBlob);
                        }, 'image/jpeg', 0.90);  // Balanced quality for AI analysis
                    };
                    img.onerror = reject;
                    img.src = url;
                }
            }
        });
    }
    
    // Analyze image with OpenAI
    async function analyzeImage(frontBase64, photoIndex) {
        console.log('analyzeImage called with API key:', !!openaiApiKey);
        if (!openaiApiKey) return;
        
        // Find the photo data to store results
        const photo = recentPhotos.find(p => p.index === photoIndex);
        
        const detailsContainer = document.getElementById(`details-${photoIndex}`);
        detailsContainer.innerHTML = `
            <div class="p-3 flex justify-center items-center">
                <div class="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        `;
        
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

IMPORTANT: Include the main COLOR of the product/car in the title.
Return ONLY this JSON structure with extracted information:
{
  "title": "60-80 char eBay title with year brand product/player card#/model COLOR series# features",
  "details": {
    "brand": "manufacturer name or null",
    "year": "year or null", 
    "setName": "set/series name or null",
    "cardNumber": "card/model number or null",
    "seriesNumber": "series like 5/5 or null",
    "color": "main color of product or null",
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
                    model: 'gpt-4o-mini',  // Fastest and cheapest model
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
            
            // Store the analysis data with the photo
            if (photo) {
                photo.analysisData = parsed;
            }
            
            displayCardDetails(detailsContainer, parsed, photoIndex);
            
        } catch (error) {
            console.error('Error analyzing image:', error);
            if (error.message.includes('Invalid response format')) {
                detailsContainer.innerHTML = `<div class="p-3 text-red-400 text-xs text-center">Error: Unable to parse AI response</div>`;
            } else if (error.message.includes('401')) {
                detailsContainer.innerHTML = `<div class="p-3 text-red-400 text-xs text-center">Error: Invalid API key</div>`;
            } else if (error.message.includes('429')) {
                detailsContainer.innerHTML = `<div class="p-3 text-red-400 text-xs text-center">Error: Rate limit exceeded</div>`;
            } else {
                detailsContainer.innerHTML = `<div class="p-3 text-red-400 text-xs text-center">Error: ${error.message}</div>`;
            }
        }
    }
    
    // Delete a specific photo
    function deletePhoto(photoIndex) {
        const photo = recentPhotos.find(p => p.index === photoIndex);
        if (photo) {
            // Clean up resources
            if (photo.url) URL.revokeObjectURL(photo.url);
            delete photo.frontBase64;
            delete photo.blob;
            delete photo.analysisData;
            
            // Remove from array
            recentPhotos = recentPhotos.filter(p => p.index !== photoIndex);
            
            // Update UI
            updatePreviews();
        }
    }
    
    // Make deletePhoto globally accessible
    window.deletePhoto = deletePhoto;
    
    // Toggle edit mode for title
    function toggleEditTitle(photoIndex) {
        const titleEl = document.getElementById(`title-${photoIndex}`);
        const editBtn = document.getElementById(`edit-${photoIndex}`);
        
        if (!titleEl) return;
        
        const isEditing = titleEl.contentEditable === 'true';
        
        if (isEditing) {
            // Save and exit edit mode
            titleEl.contentEditable = 'false';
            titleEl.classList.remove('bg-slate-800', 'px-2', 'py-1', 'rounded');
            
            // Update the stored data
            const photo = recentPhotos.find(p => p.index === parseInt(photoIndex));
            if (photo && photo.analysisData) {
                photo.analysisData.title = titleEl.textContent.trim();
            }
            
            // Update button icon to edit
            editBtn.innerHTML = `
                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                </svg>
            `;
        } else {
            // Enter edit mode
            titleEl.contentEditable = 'true';
            titleEl.classList.add('bg-slate-800', 'px-2', 'py-1', 'rounded');
            titleEl.focus();
            
            // Select all text
            const range = document.createRange();
            range.selectNodeContents(titleEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            
            // Update button icon to save
            editBtn.innerHTML = `
                <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
            `;
        }
    }
    
    // Copy title to clipboard
    function copyTitle(photoIndex) {
        const titleEl = document.getElementById(`title-${photoIndex}`);
        if (!titleEl) return;
        
        const title = titleEl.textContent.trim();
        navigator.clipboard.writeText(title).then(() => {
            showToast('Title Copied! ✅', title);
        }).catch(err => {
            console.error('Failed to copy title:', err);
            showToast('⚠️ Copy Failed', 'Please copy manually');
        });
    }
    
    // Make functions globally accessible
    window.toggleEditTitle = toggleEditTitle;
    window.copyTitle = copyTitle;
    
    // Display card details
    function displayCardDetails(container, data, photoIndex) {
        if (!data || !data.details) {
            container.innerHTML = '<div class="preview-error">Invalid data format</div>';
            return;
        }
        
        const details = data.details;
        let html = '<div class="p-3 bg-emerald-900/10 border-t border-emerald-800/30">';
        
        // Title with edit and copy buttons
        if (data.title) {
            const titleId = `title-${photoIndex}`;
            const editBtnId = `edit-${photoIndex}`;
            const copyBtnId = `copy-${photoIndex}`;
            
            html += `
                <div class="mb-2">
                    <div class="flex items-start gap-2">
                        <h5 id="${titleId}" class="text-xs font-semibold text-emerald-400 leading-relaxed flex-1" contenteditable="false">${data.title}</h5>
                        <button id="${editBtnId}" onclick="toggleEditTitle('${photoIndex}')" class="p-1 hover:bg-slate-700 rounded transition-all" title="Edit title">
                            <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path>
                            </svg>
                        </button>
                        <button id="${copyBtnId}" onclick="copyTitle('${photoIndex}')" class="p-1 hover:bg-slate-700 rounded transition-all" title="Copy to clipboard">
                            <svg class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            `;
        }
        
        // Details with Tailwind styling
        const addDetail = (label, value) => {
            if (value && value !== 'null') {
                html += `<div class="flex gap-2 text-xs mb-1">
                    <span class="text-slate-500 font-medium">${label}:</span>
                    <span class="text-slate-400">${value}</span>
                </div>`;
            }
        };
        
        addDetail('Brand', details.brand);
        addDetail('Year', details.year);
        addDetail('Set', details.setName);
        addDetail('Model/Card #', details.cardNumber);
        addDetail('Series', details.seriesNumber);
        addDetail('Name/Model', details.playerName);
        addDetail('Team', details.team);
        
        if (details.features && Array.isArray(details.features) && details.features.length > 0 && details.features[0] !== null) {
            const validFeatures = details.features.filter(f => f && f !== 'null');
            if (validFeatures.length > 0) {
                addDetail('Features', validFeatures.join(', '));
            }
        }
        
        addDetail('Condition', details.condition);
        addDetail('Notes', details.otherInfo);
        
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
        
        // Convert to blob - 85% quality is optimal for eBay (smaller file, faster processing)
        canvas.toBlob(async function(blob) {
            const timestamp = Date.now();
            const date = new Date(timestamp);
            const filename = `ebay-${date.toISOString().split('T')[0]}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.jpg`;
            
            // Download with requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                downloadBlob(blob, filename);
            });
            
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
                frontBase64: frontBase64,
                analysisData: null // Will store AI analysis results
            };
            
            recentPhotos.unshift(photoData);
            
            // Keep only the last 4 photos and clean up memory
            if (recentPhotos.length > 4) {
                // Clean up old photos to free memory
                const photosToRemove = recentPhotos.slice(4);
                photosToRemove.forEach(photo => {
                    if (photo.url) URL.revokeObjectURL(photo.url);
                    // Clear all data to free memory
                    delete photo.frontBase64;
                    delete photo.blob;
                    delete photo.analysisData;
                });
                recentPhotos = recentPhotos.slice(0, 4);
            }
            
            updatePreviews();
            
            // Analyze with OpenAI if API key is set AND analysis is requested
            if (openaiApiKey && performAnalysis) {
                analyzeImage(frontBase64, photoData.index);
            }
            
        }, 'image/jpeg', 0.92);
    }
    
    // Update photo counter
    function updatePhotoCounter() {
        const counter = document.getElementById('photoCounter');
        if (counter) {
            const titlesCount = recentPhotos.filter(p => p.analysisData && p.analysisData.title).length;
            counter.textContent = `${recentPhotos.length}/4 photos${titlesCount > 0 ? ` • ${titlesCount} with AI titles` : ''}`;
        }
    }
    
    // Update previews with performance optimization
    function updatePreviews() {
        // Update counter
        updatePhotoCounter();
        
        // Use DocumentFragment for better performance
        const fragment = document.createDocumentFragment();
        
        recentPhotos.forEach(photo => {
            const card = document.createElement('div');
            card.className = 'relative bg-slate-900/80 rounded-2xl overflow-hidden border border-slate-800 hover:border-emerald-500/50 transition-all hover:shadow-xl hover:shadow-emerald-500/10 group';
            
            // Add delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'absolute top-2 right-2 z-10 w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg';
            deleteBtn.innerHTML = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Delete this photo?')) {
                    deletePhoto(photo.index);
                }
            };
            card.appendChild(deleteBtn);
            
            // Add AI analysis button (only if API key is configured)
            if (openaiApiKey) {
                const analyzeBtn = document.createElement('button');
                analyzeBtn.className = 'absolute top-2 left-2 z-10 w-8 h-8 bg-emerald-500/80 hover:bg-emerald-500 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg';
                analyzeBtn.title = 'Run AI Analysis';
                analyzeBtn.innerHTML = `<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>`;
                analyzeBtn.onclick = (e) => {
                    e.stopPropagation();
                    // Re-run analysis
                    if (photo.frontBase64) {
                        analyzeImage(photo.frontBase64, photo.index);
                    } else if (photo.blob) {
                        // Convert blob to base64 if needed
                        blobToBase64(photo.blob).then(base64 => {
                            photo.frontBase64 = base64;
                            analyzeImage(base64, photo.index);
                        });
                    }
                };
                card.appendChild(analyzeBtn);
            }
            
            const img = document.createElement('img');
            img.src = photo.url;
            img.className = 'w-full aspect-square object-cover';
            
            const info = document.createElement('div');
            info.className = 'p-3 border-t border-slate-800';
            
            const time = document.createElement('div');
            time.className = 'text-xs text-slate-500 flex items-center gap-1';
            time.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>${formatTime(photo.timestamp)}`;
            
            const filename = document.createElement('div');
            filename.className = 'text-xs text-slate-600 font-mono mt-1 truncate';
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
                
                // Restore analysis data if it exists
                if (photo.analysisData) {
                    displayCardDetails(detailsContainer, photo.analysisData, photo.index);
                }
            }
            
            
            fragment.appendChild(card);
        });
        
        // Clear and append all at once
        previewsContainer.innerHTML = '';
        previewsContainer.appendChild(fragment);
    }
    
    // Event listeners
    cameraSelect.addEventListener('change', function() {
        if (this.value) {
            // Save camera preference
            localStorage.setItem('preferred_camera', this.value);
            initWebcam(this.value);
        }
    });
    
    // Quality preset change
    if (qualitySelect) {
        qualitySelect.addEventListener('change', function() {
            // Save quality preference
            localStorage.setItem('preferred_quality', this.value);
            
            // Reinitialize camera with new quality setting
            const currentDevice = cameraSelect.value || (currentStream ? currentStream.getVideoTracks()[0].getSettings().deviceId : null);
            if (currentDevice) {
                // Show loading state
                if (cameraLoading) {
                    cameraLoading.style.display = 'flex';
                }
                initWebcam(currentDevice);
            }
        });
    }
    
    // Spacebar to capture with debouncing
    let captureInProgress = false;
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space' && e.target === document.body) {
            e.preventDefault();
            
            // Prevent multiple captures while processing
            if (captureInProgress) return;
            
            captureInProgress = true;
            const performAnalysis = e.shiftKey && openaiApiKey;
            console.log('Capture triggered - Shift:', e.shiftKey, 'API Key:', !!openaiApiKey, 'Analysis:', performAnalysis);
            capturePhoto(performAnalysis);
            
            // Reset flag after a short delay
            setTimeout(() => {
                captureInProgress = false;
            }, 500);
        }
    });
    
    // Resize handler
    window.addEventListener('resize', updateCropGuide);
    
    // Prevent accidental page refresh/close when photos exist
    window.addEventListener('beforeunload', function(e) {
        if (recentPhotos.length > 0) {
            e.preventDefault();
            e.returnValue = 'You have unsaved photos. Are you sure you want to leave?';
            return e.returnValue;
        }
    });
    
    // Start
    getCameras();
}