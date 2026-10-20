import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const KnowledgeGraph = () => {
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const graphRef = useRef();

    useEffect(() => {
        if (window.electronAPI && window.electronAPI.getObsidianGraph) {
            window.electronAPI.getObsidianGraph().then(data => {
                if (data) {
                    setGraphData(data);
                }
            }).catch(console.error);
        }
    }, []);

    // Get the current neon theme glow from CSS variables
    const getThemeGlow = () => {
        const glow = getComputedStyle(document.body).getPropertyValue('--theme-glow-rgb').trim();
        return glow || '199, 192, 166';
    };

    return (
        <div style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', borderRadius: '4px', overflow: 'hidden' }}>
            {graphData.nodes.length > 0 ? (
                <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeRelSize={6}
                    d3VelocityDecay={0.2} // High decay for snappy, hologram-like settling
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const themeGlow = getThemeGlow();
                        const label = node.id;
                        const fontSize = Math.max(10 / globalScale, 4); // Keep font readable
                        
                        // Neon node dot
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI, false);
                        ctx.fillStyle = `rgb(${themeGlow})`;
                        ctx.shadowColor = `rgba(${themeGlow}, 1)`;
                        ctx.shadowBlur = 10;
                        ctx.fill();

                        // Node Label
                        ctx.font = `${fontSize}px 'Courier New', Courier, monospace`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillStyle = `rgba(${themeGlow}, 0.9)`;
                        ctx.shadowBlur = 0; // Remove shadow for text crispness
                        ctx.fillText(label, node.x, node.y + node.val + 2);
                    }}
                    linkColor={() => {
                        const themeGlow = getThemeGlow();
                        return `rgba(${themeGlow}, 0.25)`;
                    }}
                    linkWidth={1.5}
                    cooldownTicks={100}
                    onEngineStop={() => graphRef.current?.zoomToFit(400)}
                />
            ) : (
                <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: 'var(--nier-text)' }}>
                    SCANNING OBSIDIAN VAULT...
                </div>
            )}
        </div>
    );
};

export default KnowledgeGraph;
