document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const cropCanvas = document.getElementById('cropCanvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const cropContext = cropCanvas.getContext('2d', { willReadFrequently: true });
    const captureButton = document.getElementById('capture');
    const captureAdvancedButton = document.getElementById('capture-advanced');
    const previewsContainer = document.getElementById('previews');
    const flashOverlay = document.getElementById('flash');
    const notification = document.getElementById('notification');
    const cropGuide = document.getElementById('cropGuide');
    const cameraSelect = document.getElementById('camera-select');
    const cameraSelectorContainer = document.getElementById('camera-selector-container');
    const qualitySlider = document.getElementById('quality-slider');
    const qualityValue = document.getElementById('quality-value');
    const outputSizeSelect = document.getElementById('output-size');
    const autoEnhanceCheckbox = document.getElementById('auto-enhance');
    const noiseReductionCheckbox = document.getElementById('noise-reduction');
    const cameraResolutionDisplay = document.getElementById('camera-resolution');
    
    // State
    let recentPhotos = [];
    let squareSize = 0;
    let currentStream = null;
    let availableDevices = [];
    
    // Update quality display
    qualitySlider.addEventListener('input', function() {
        qualityValue.textContent = this.value + '%';
    });
    
    // Get available cameras
    async function getCameras() {
        try {
            // First request permission to access cameras
            await navigator.mediaDevices.getUserMedia({ video: true });
            
            // Get all devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            availableDevices = devices.filter(device => device.kind === 'videoinput');
            
            // Clear and populate dropdown
            cameraSelect.innerHTML = '';
            
            if (availableDevices.length > 1) {
                cameraSelectorContainer.style.display = 'block';
            }
            
            availableDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Camera ${index + 1}`;
                cameraSelect.appendChild(option);
            });
            
            // Start with the first camera
            if (availableDevices.length > 0) {
                initWebcam(availableDevices[0].deviceId);
            }
        } catch (err) {
            console.error('Error getting cameras:', err);
            alert('Unable to access cameras. Please ensure you have granted camera permissions.');
        }
    }
    
    // Initialize webcam with 4K constraints
    async function initWebcam(deviceId) {
        try {
            // Stop current stream if exists
            if (currentStream) {
                currentStream.getTracks().forEach(track => track.stop());
            }
            
            // Try 4K first, then fallback to best available
            const constraints = {
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    width: { ideal: 3840, min: 1920 },
                    height: { ideal: 2160, min: 1080 },
                    frameRate: { ideal: 30, min: 24 },
                    facingMode: 'environment' // Try rear camera first for better quality
                }
            };
            
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                // Fallback to front camera or lower resolution
                console.log('4K not available, trying alternate settings');
                constraints.video.width = { ideal: 1920 };
                constraints.video.height = { ideal: 1080 };
                constraints.video.facingMode = 'user';
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            }
            
            video.srcObject = currentStream;
            video.addEventListener('loadedmetadata', () => {
                updateCropGuide();
                updateResolutionDisplay();
            });
        } catch (err) {
            console.error('Error accessing webcam:', err);
            alert('Unable to access webcam. Please ensure you have granted camera permissions.');
        }
    }
    
    // Update resolution display
    function updateResolutionDisplay() {
        const track = currentStream.getVideoTracks()[0];
        const settings = track.getSettings();
        cameraResolutionDisplay.textContent = `${settings.width}x${settings.height} @ ${settings.frameRate}fps`;
    }
    
    // Update crop guide size and position
    function updateCropGuide() {
        const videoWidth = video.offsetWidth;
        const videoHeight = video.offsetHeight;
        
        // Calculate square size (80% of the smaller dimension)
        squareSize = Math.min(videoWidth, videoHeight) * 0.8;
        
        cropGuide.style.width = squareSize + 'px';
        cropGuide.style.height = squareSize + 'px';
    }
    
    // Format timestamp for display
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const options = { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true,
            month: 'short',
            day: 'numeric'
        };
        return date.toLocaleString('en-US', options);
    }
    
    // Format file size
    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return Math.round(bytes / 1024) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
    }
    
    // Show success notification
    function showNotification(message = '✓ Photo captured!') {
        notification.textContent = message;
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    // Apply image enhancements
    function enhanceImage(context, width, height) {
        if (!autoEnhanceCheckbox.checked && !noiseReductionCheckbox.checked) return;
        
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        if (autoEnhanceCheckbox.checked) {
            // Auto contrast and brightness adjustment
            let min = 255, max = 0;
            
            // Find min and max values
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                min = Math.min(min, gray);
                max = Math.max(max, gray);
            }
            
            // Apply contrast stretch
            const range = max - min;
            if (range > 0) {
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = Math.min(255, Math.max(0, ((data[i] - min) * 255) / range));
                    data[i + 1] = Math.min(255, Math.max(0, ((data[i + 1] - min) * 255) / range));
                    data[i + 2] = Math.min(255, Math.max(0, ((data[i + 2] - min) * 255) / range));
                }
            }
            
            // Slight sharpening
            const sharpened = new Uint8ClampedArray(data);
            const factor = 0.1; // Subtle sharpening
            
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    
                    for (let c = 0; c < 3; c++) {
                        const center = data[idx + c] * 5;
                        const top = data[((y - 1) * width + x) * 4 + c];
                        const bottom = data[((y + 1) * width + x) * 4 + c];
                        const left = data[(y * width + (x - 1)) * 4 + c];
                        const right = data[(y * width + (x + 1)) * 4 + c];
                        
                        const sharp = center - top - bottom - left - right;
                        sharpened[idx + c] = Math.min(255, Math.max(0, data[idx + c] + sharp * factor));
                    }
                }
            }
            
            // Copy sharpened data back
            for (let i = 0; i < data.length; i++) {
                data[i] = sharpened[i];
            }
        }
        
        if (noiseReductionCheckbox.checked) {
            // Simple noise reduction using median-like filter
            const filtered = new Uint8ClampedArray(data);
            
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    
                    for (let c = 0; c < 3; c++) {
                        const neighbors = [
                            data[((y - 1) * width + (x - 1)) * 4 + c],
                            data[((y - 1) * width + x) * 4 + c],
                            data[((y - 1) * width + (x + 1)) * 4 + c],
                            data[(y * width + (x - 1)) * 4 + c],
                            data[idx + c],
                            data[(y * width + (x + 1)) * 4 + c],
                            data[((y + 1) * width + (x - 1)) * 4 + c],
                            data[((y + 1) * width + x) * 4 + c],
                            data[((y + 1) * width + (x + 1)) * 4 + c]
                        ];
                        
                        neighbors.sort((a, b) => a - b);
                        filtered[idx + c] = neighbors[4]; // Median
                    }
                }
            }
            
            // Blend original with filtered (50% mix to preserve detail)
            for (let i = 0; i < data.length; i += 4) {
                data[i] = (data[i] + filtered[i]) / 2;
                data[i + 1] = (data[i + 1] + filtered[i + 1]) / 2;
                data[i + 2] = (data[i + 2] + filtered[i + 2]) / 2;
            }
        }
        
        context.putImageData(imageData, 0, 0);
    }
    
    // Robust download function
    function downloadBlob(blob, filename) {
        // Method 1: Try using object URL
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Clean up URL after delay
            setTimeout(() => URL.revokeObjectURL(url), 100);
            return;
        } catch (e) {
            console.log('Method 1 failed, trying method 2');
        }
        
        // Method 2: If method 1 fails, try using FileReader
        try {
            const reader = new FileReader();
            reader.onload = function() {
                const a = document.createElement('a');
                a.href = reader.result;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
            reader.readAsDataURL(blob);
        } catch (e) {
            console.error('Download failed:', e);
            showNotification('❌ Download failed - please try again');
        }
    }
    
    // Capture and auto-crop photo
    function capturePhoto(useAdvancedMode = false) {
        // Flash effect
        flashOverlay.classList.add('flash-animation');
        setTimeout(() => {
            flashOverlay.classList.remove('flash-animation');
        }, 500);
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw current video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (useAdvancedMode) {
            // Advanced mode - save full image for manual editing
            const quality = qualitySlider.value / 100;
            
            // Apply enhancements to full image
            enhanceImage(context, canvas.width, canvas.height);
            
            canvas.toBlob(function(blob) {
                const timestamp = new Date().getTime();
                const date = new Date(timestamp);
                const dateStr = date.toISOString().split('T')[0];
                const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
                const filename = `ebay-product-${dateStr}-${timeStr}-full.jpg`;
                
                downloadBlob(blob, filename);
                showNotification('✓ Full photo saved - edit in your favorite app!');
            }, 'image/jpeg', quality);
        } else {
            // Normal mode - auto crop to square
            // Calculate crop dimensions
            const scale = video.videoWidth / video.offsetWidth;
            const cropSize = squareSize * scale;
            const startX = (video.videoWidth - cropSize) / 2;
            const startY = (video.videoHeight - cropSize) / 2;
            
            // Get target output size
            const outputSize = parseInt(outputSizeSelect.value);
            
            // Create final canvas at target size
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = outputSize;
            finalCanvas.height = outputSize;
            const finalContext = finalCanvas.getContext('2d', { willReadFrequently: true });
            
            // Enable image smoothing for quality
            finalContext.imageSmoothingEnabled = true;
            finalContext.imageSmoothingQuality = 'high';
            
            // Draw cropped and scaled image
            finalContext.drawImage(
                canvas,
                startX, startY, cropSize, cropSize,  // Source rectangle
                0, 0, outputSize, outputSize          // Destination rectangle
            );
            
            // Apply enhancements
            enhanceImage(finalContext, outputSize, outputSize);
            
            // Get quality setting
            const quality = qualitySlider.value / 100;
            
            // Convert to blob
            finalCanvas.toBlob(function(blob) {
                if (!blob) {
                    console.error('Failed to create blob');
                    showNotification('❌ Error creating image');
                    return;
                }
                
                const timestamp = new Date().getTime();
                const date = new Date(timestamp);
                const dateStr = date.toISOString().split('T')[0];
                const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
                const filename = `ebay-product-${dateStr}-${timeStr}-${outputSize}px.jpg`;
                
                // Create object URL for preview
                const url = URL.createObjectURL(blob);
                
                // Add to recent photos
                recentPhotos.unshift({
                    url: url,
                    blob: blob,
                    timestamp: timestamp,
                    filename: filename,
                    size: blob.size
                });
                
                // Keep only the last 3 photos
                if (recentPhotos.length > 3) {
                    URL.revokeObjectURL(recentPhotos[3].url);
                    recentPhotos = recentPhotos.slice(0, 3);
                }
                
                updatePreviews();
                
                // Download the image
                downloadBlob(blob, filename);
                
                showNotification(`✓ ${outputSize}×${outputSize}px photo captured!`);
                
            }, 'image/jpeg', quality);
        }
    }
    
    // Update preview display
    function updatePreviews() {
        previewsContainer.innerHTML = '';
        
        recentPhotos.forEach(function(photo, index) {
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
            time.innerHTML = `🕒 ${formatTime(photo.timestamp)}`;
            
            const filename = document.createElement('div');
            filename.className = 'preview-filename';
            filename.textContent = photo.filename;
            
            info.appendChild(time);
            info.appendChild(filename);
            
            if (photo.size) {
                const size = document.createElement('div');
                size.className = 'preview-size';
                size.textContent = `📁 ${formatFileSize(photo.size)}`;
                info.appendChild(size);
            }
            
            card.appendChild(img);
            card.appendChild(info);
            
            // Add click handler for download
            card.addEventListener('click', function() {
                if (photo.blob) {
                    downloadBlob(photo.blob, photo.filename);
                } else {
                    // Fallback for older method
                    const a = document.createElement('a');
                    a.href = photo.url;
                    a.download = photo.filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                
                // Quick highlight effect
                card.style.borderColor = 'var(--success-color)';
                setTimeout(() => {
                    card.style.borderColor = '';
                }, 300);
            });
            
            col.appendChild(card);
            previewsContainer.appendChild(col);
        });
    }
    
    // Event listeners
    captureButton.addEventListener('click', () => capturePhoto(false));
    captureAdvancedButton.addEventListener('click', () => capturePhoto(true));
    
    // Camera selector change
    cameraSelect.addEventListener('change', function() {
        if (this.value) {
            initWebcam(this.value);
        }
    });
    
    // Keyboard shortcut (spacebar to capture)
    document.addEventListener('keydown', function(e) {
        if (e.code === 'Space' && e.target === document.body) {
            e.preventDefault();
            capturePhoto(false);
        }
    });
    
    // Update crop guide on window resize
    window.addEventListener('resize', updateCropGuide);
    
    // Initialize cameras on page load
    getCameras();
});
