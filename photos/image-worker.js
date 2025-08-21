// Web Worker for image processing
self.addEventListener('message', async function(e) {
    const { blob, maxWidth } = e.data;
    
    try {
        let result;
        
        // If blob is small enough, convert directly
        if (blob.size < 500000) { // Less than 500KB
            const reader = new FileReader();
            result = await new Promise((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } else {
            // For larger images, resize first
            const bitmap = await createImageBitmap(blob);
            const aspectRatio = bitmap.height / bitmap.width;
            const newWidth = Math.min(maxWidth || 1000, bitmap.width);
            const newHeight = newWidth * aspectRatio;
            
            // Create offscreen canvas for resizing
            const canvas = new OffscreenCanvas(newWidth, newHeight);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
            
            // Convert to blob
            const resizedBlob = await canvas.convertToBlob({
                type: 'image/jpeg',
                quality: 0.90
            });
            
            // Convert to base64
            const reader = new FileReader();
            result = await new Promise((resolve, reject) => {
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(resizedBlob);
            });
            
            bitmap.close();
        }
        
        self.postMessage({ success: true, base64: result });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
});