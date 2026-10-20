import React, { useState, useEffect, useRef } from 'react';

const Widget = ({ id, title, defaultPos, defaultSize, headerAction, editModeWidgetId, setEditModeWidgetId, children }) => {
    const [pos, setPos] = useState(() => {
        const saved = localStorage.getItem(`${id}_pos`);
        return saved ? JSON.parse(saved) : defaultPos;
    });

    const [size, setSize] = useState(() => {
        const saved = localStorage.getItem(`${id}_size`);
        return saved ? JSON.parse(saved) : defaultSize;
    });

    const [isDragging, setIsDragging] = useState(false);
    const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

    const [isResizing, setIsResizing] = useState(false);
    const resizeDir = useRef('');
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, l: 0, t: 0 });

    const latestPos = useRef(pos);
    const latestSize = useRef(size);

    // Keep refs in sync with state changes
    useEffect(() => {
        latestPos.current = pos;
    }, [pos]);

    useEffect(() => {
        latestSize.current = size;
    }, [size]);

    // Handle Drag
    const onHeaderMouseDown = (e) => {
        if (e.target.closest('input, button, textarea')) return;
        setIsDragging(true);
        dragStart.current = {
            x: e.clientX,
            y: e.clientY,
            initialX: pos.x,
            initialY: pos.y
        };
        document.body.classList.add('dragging-active');
    };

    // Handle Resize
    const onHandleMouseDown = (e, dir) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeDir.current = dir;
        resizeStart.current = {
            x: e.clientX,
            y: e.clientY,
            w: size.w,
            h: size.h,
            l: pos.x,
            t: pos.y
        };
        document.body.classList.add('dragging-active');
    };

    useEffect(() => {
        const onMouseMove = (e) => {
            if (isDragging) {
                const dx = e.clientX - dragStart.current.x;
                const dy = e.clientY - dragStart.current.y;
                const newPos = {
                    x: dragStart.current.initialX + dx,
                    y: dragStart.current.initialY + dy
                };
                latestPos.current = newPos;
                setPos(newPos);
            } else if (isResizing) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                const dir = resizeDir.current;
                
                let newW = resizeStart.current.w;
                let newH = resizeStart.current.h;
                let newL = resizeStart.current.l;
                let newT = resizeStart.current.t;

                const minW = 200;
                const minH = 100;

                // Vertical resizing
                if (dir.includes('n')) {
                    const calculatedH = resizeStart.current.h - dy;
                    if (calculatedH >= minH) {
                        newH = calculatedH;
                        newT = resizeStart.current.t + dy;
                    }
                } else if (dir.includes('s')) {
                    const calculatedH = resizeStart.current.h + dy;
                    if (calculatedH >= minH) {
                        newH = calculatedH;
                    }
                }

                // Horizontal resizing
                if (dir.includes('w')) {
                    const calculatedW = resizeStart.current.w - dx;
                    if (calculatedW >= minW) {
                        newW = calculatedW;
                        newL = resizeStart.current.l + dx;
                    }
                } else if (dir.includes('e')) {
                    const calculatedW = resizeStart.current.w + dx;
                    if (calculatedW >= minW) {
                        newW = calculatedW;
                    }
                }

                latestPos.current = { x: newL, y: newT };
                latestSize.current = { w: newW, h: newH };

                setSize({ w: newW, h: newH });
                setPos({ x: newL, y: newT });
            }
        };

        const onMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                document.body.classList.remove('dragging-active');
                localStorage.setItem(`${id}_pos`, JSON.stringify(latestPos.current));
            }
            if (isResizing) {
                setIsResizing(false);
                document.body.classList.remove('dragging-active');
                localStorage.setItem(`${id}_size`, JSON.stringify(latestSize.current));
                localStorage.setItem(`${id}_pos`, JSON.stringify(latestPos.current));
            }
        };

        if (isDragging || isResizing) {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, isResizing, id]);

    const directions = ['n', 'e', 's', 'w', 'nw', 'ne', 'se', 'sw'];

    const onKeyDown = (e) => {
        // If this widget is in edit mode, only intercept Escape key to exit edit mode
        if (editModeWidgetId === id) {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setEditModeWidgetId(null);
                // Return focus to the widget container
                document.getElementById(id)?.focus();
            }
            return;
        }

        // Only move/resize if the container itself has focus (navigation mode)
        if (e.target !== e.currentTarget) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            setEditModeWidgetId(id);
            // Focus first input, textarea, or contenteditable inside this widget
            setTimeout(() => {
                const el = document.getElementById(id);
                const focusable = el?.querySelector('textarea, input, [contenteditable="true"]');
                focusable?.focus();
            }, 50);
            return;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 2;

            if (e.ctrlKey) {
                // Resize widget using Ctrl + Arrow Keys
                let newW = size.w;
                let newH = size.h;

                if (e.key === 'ArrowRight') newW += step;
                if (e.key === 'ArrowLeft') newW = Math.max(200, newW - step);
                if (e.key === 'ArrowDown') newH += step;
                if (e.key === 'ArrowUp') newH = Math.max(100, newH - step);

                const newSize = { w: newW, h: newH };
                setSize(newSize);
                latestSize.current = newSize;
                localStorage.setItem(`${id}_size`, JSON.stringify(newSize));
            } else {
                // Move widget using Arrow Keys
                let newX = pos.x;
                let newY = pos.y;

                if (e.key === 'ArrowUp') newY -= step;
                if (e.key === 'ArrowDown') newY += step;
                if (e.key === 'ArrowLeft') newX -= step;
                if (e.key === 'ArrowRight') newX += step;

                const newPos = { x: newX, y: newY };
                setPos(newPos);
                latestPos.current = newPos;
                localStorage.setItem(`${id}_pos`, JSON.stringify(newPos));
            }
        }
    };

    return (
        <div 
            id={id} 
            className={`widget ${editModeWidgetId === id ? 'is-editing' : ''}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            style={{
                left: `${pos.x}px`,
                top: `${pos.y}px`,
                width: `${size.w}px`,
                height: `${size.h}px`
            }}
        >
            <div className="widget-header" onMouseDown={onHeaderMouseDown}>
                <span className="drag-indicator">::</span>
                <span className="title">{title}</span>
                {headerAction}
            </div>
            
            <div className="widget-content">
                {children}
            </div>

            {/* Custom resize handle boundaries */}
            {directions.map(dir => (
                <div 
                    key={dir} 
                    className={`resize-handle ${dir}`} 
                    onMouseDown={(e) => onHandleMouseDown(e, dir)}
                />
            ))}
        </div>
    );
};

export default Widget;
