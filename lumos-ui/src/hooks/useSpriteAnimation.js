import { useState, useEffect } from 'react';

// Configuration for the stickman sprite sheet
// Total dimensions: 9 columns, 10 rows
export const SPRITE_CONFIG = {
    columns: 9,
    rows: 10,
    animations: {
        idle: { row: 0, frames: 4 },
        walking: { row: 1, frames: 8 },
        running: { row: 2, frames: 8 },
        jumping: { row: 3, frames: 7 },
        dash: { row: 4, frames: 5 },
        attacking: { row: 5, frames: 6 }, // Punch
        kicking: { row: 6, frames: 6 },
        slashing: { row: 7, frames: 6 },
        hurt: { row: 8, frames: 3 },
        death: { row: 9, frames: 4 }
    }
};

export function useSpriteAnimation(currentState, config = SPRITE_CONFIG) {
    const [frameX, setFrameX] = useState(0);

    useEffect(() => {
        const animConfig = config.animations[currentState] || config.animations.idle;
        
        // Reset frame when animation changes
        setFrameX(0);

        const interval = setInterval(() => {
            setFrameX(prev => (prev + 1) % animConfig.frames);
        }, 100); // 10fps

        return () => clearInterval(interval);
    }, [currentState, config]);

    const activeAnim = config.animations[currentState] || config.animations.idle;
    
    return {
        frameX,
        frameY: activeAnim.row,
        // Calculate background position percentages
        // When there are N columns, you move by 100% / (N - 1)
        bgPosX: (frameX / (config.columns - 1)) * 100,
        bgPosY: (activeAnim.row / (config.rows - 1)) * 100,
        backgroundSize: `${config.columns * 100}% ${config.rows * 100}%`
    };
}
