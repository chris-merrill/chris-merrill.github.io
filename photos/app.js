document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');
    const captureButton = document.getElementById('capture');
    const previewsContainer = document.getElementById('previews');
    const flashOverlay = document.getElementById('flash');
    const cropGuide = document.getElementById('cropGuide');
    const cameraSelect = document.getElementById('camera-select');
    const cameraSelectorContainer = document.getElementById('camera-selector-container');
    const cameraResolutionDisplay = document.getElementById('camera-resolution');
    
    // State
    let recentPhotos = [];
    let squareSize = 0;
    let currentStream = null;
    
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
        canvas.toBlob(function(blob) {
            const timestamp = Date.now();
            const date = new Date(timestamp);
            const filename = `ebay-${date.toISOString().split('T')[0]}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}.jpg`;
            
            // Download immediately
            downloadBlob(blob, filename);
            
            // Add to previews
            const url = URL.createObjectURL(blob);
            recentPhotos.unshift({
                url: url,
                blob: blob,
                timestamp: timestamp,
                filename: filename
            });
            
            if (recentPhotos.length > 3) {
                URL.revokeObjectURL(recentPhotos[3].url);
                recentPhotos = recentPhotos.slice(0, 3);
            }
            
            updatePreviews();
        }, 'image/jpeg', 0.95);
    }
    
    // Update previews
    function updatePreviews() {
        previewsContainer.innerHTML = '';
        
        recentPhotos.forEach(photo => {
            const col = document.createElement('div');
            col.className = 'col-md-4';
            
            const card = document.createElement('div');
            card.className = 'preview-card';
            
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
            card.appendChild(img);
            card.appendChild(info);
            
            // Click to download
            card.addEventListener('click', () => downloadBlob(photo.blob, photo.filename));
            
            col.appendChild(card);
            previewsContainer.appendChild(col);
        });
    }
    
    // Event listeners
    captureButton.addEventListener('click', capturePhoto);
    
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
});
