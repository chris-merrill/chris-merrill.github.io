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
            
            // Chrome-specific workaround: use exact constraints for better results
            const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
            
            let constraints;
            if (isChrome) {
                // For Chrome, try exact constraints first
                constraints = {
                    video: {
                        deviceId: deviceId ? { exact: deviceId } : undefined,
                        width: { exact: 3840 },
                        height: { exact: 2160 },
                        frameRate: { exact: 30 }
                    }
                };
            } else {
                // For other browsers, use ideal constraints
                constraints = {
                    video: {
                        deviceId: deviceId ? { exact: deviceId } : undefined,
                        width: { ideal: 3840, min: 1920 },
                        height: { ideal: 2160, min: 1080 },
                        frameRate: { ideal: 30, min: 24 },
                        facingMode: 'environment'
                    }
                };
            }
            
            try {
                currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                console.log('4K not available, trying 1080p');
                // Try 1080p with exact constraints for Chrome
                if (isChrome) {
                    constraints = {
                        video: {
                            deviceId: deviceId ? { exact: deviceId } : undefined,
                            width: { exact: 1920 },
                            height: { exact: 1080 },
                            frameRate: { max: 30 }
                        }
                    };
                } else {
                    constraints = {
                        video: {
                            deviceId: deviceId ? { exact: deviceId } : undefined,
                            width: { ideal: 1920, min: 1280 },
                            height: { ideal: 1080, min: 720 },
                            frameRate: { ideal: 30 }
                        }
                    };
                }
                
                try {
                    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (err2) {
                    // Final fallback - let browser choose
                    console.log('HD not available, using default resolution');
                    constraints = {
                        video: {
                            deviceId: deviceId ? { exact: deviceId } : undefined
                        }
                    };
                    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                }
            }
            
            video.srcObject = currentStream;
            
            // Apply video track constraints to ensure highest quality
            const videoTrack = currentStream.getVideoTracks()[0];
            const capabilities = videoTrack.getCapabilities();
            console.log('Camera capabilities:', capabilities);
            
            // Try to apply maximum resolution from capabilities
            if (capabilities.width && capabilities.height) {
                const newConstraints = {
                    width: capabilities.width.max,
                    height: capabilities.height.max
                };
                
                videoTrack.applyConstraints(newConstraints)
                    .then(() => {
                        console.log('Applied max resolution constraints');
                        updateResolutionDisplay();
                    })
                    .catch(e => console.log('Could not apply max constraints:', e));
            }
            
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
        
        // Show Chrome warning if resolution is low
        const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        const chromeWarning = document.getElementById('chrome-warning');
        
        if (isChrome && settings.width <= 640 && chromeWarning) {
            chromeWarning.style.display = 'block';
        }
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
    
    // Apply image enhancements (OPTIMIZED FOR SPEED)
    function enhanceImage(context, width, height) {
        // Skip if both options are disabled
        if (!autoEnhanceCheckbox.checked && !noiseReductionCheckbox.checked) return;
        
        // Only process if image is reasonably sized
        if (width * height > 4000000) { // Skip for images over 4MP
            console.log('Skipping enhancement for performance - image too large');
            return;
        }
        
        const imageData = context.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        if (autoEnhanceCheckbox.checked) {
            // Simple brightness/contrast adjustment only
            const contrast = 1.1; // 10% contrast boost
            const brightness = 5; // Slight brightness boost
            
            for (let i = 0; i < data.length; i += 4) {
                data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrast + 128 + brightness));
                data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrast + 128 + brightness));
                data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrast + 128 + brightness));
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
            
            // For eBay, we don't need huge files - cap at actual need
            const finalSize = Math.min(outputSize, Math.max(cropSize, 1500));
            
            // Create final canvas at target size
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = finalSize;
            finalCanvas.height = finalSize;
            const finalContext = finalCanvas.getContext('2d');
            
            // Enable image smoothing for quality
            finalContext.imageSmoothingEnabled = true;
            finalContext.imageSmoothingQuality = 'high';
            
            // Draw cropped and scaled image
            finalContext.drawImage(
                canvas,
                startX, startY, cropSize, cropSize,  // Source rectangle
                0, 0, finalSize, finalSize            // Destination rectangle
            );
            
            // Apply enhancements only if enabled
            if (autoEnhanceCheckbox.checked) {
                enhanceImage(finalContext, finalSize, finalSize);
            }
            
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
                const filename = `ebay-product-${dateStr}-${timeStr}-${finalSize}px.jpg`;
                
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
                
                showNotification(`✓ ${finalSize}×${finalSize}px photo captured!`);
                
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
