import React, { useState, useEffect } from 'react';

const Sprite = ({ src, className, alt }) => {
    const [dataUrl, setDataUrl] = useState('');

    useEffect(() => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // just in case
        img.src = src;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Key out bright green
                if (g > 150 && r < 150 && b < 150) {
                    data[i + 3] = 0; // Transparent
                }
            }
            
            ctx.putImageData(imageData, 0, 0);
            setDataUrl(canvas.toDataURL('image/png'));
        };
    }, [src]);

    if (!dataUrl) return null;
    return <img src={dataUrl} className={className} alt={alt} />;
};

export default Sprite;
