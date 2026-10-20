import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Widget from '../Widget';

describe('Widget Component', () => {
    const defaultPos = { x: 10, y: 20 };
    const defaultSize = { w: 300, h: 200 };

    it('renders with title and children content', () => {
        render(
            <Widget
                id="test-widget"
                title="// TEST WIDGET"
                defaultPos={defaultPos}
                defaultSize={defaultSize}
                editModeWidgetId={null}
                setEditModeWidgetId={vi.fn()}
            >
                <div data-testid="widget-child">Hello World</div>
            </Widget>
        );

        expect(screen.getByText('// TEST WIDGET')).toBeInTheDocument();
        expect(screen.getByTestId('widget-child')).toBeInTheDocument();
    });

    it('supports tabIndex focus and active editing class when editModeWidgetId matches id', () => {
        const { container } = render(
            <Widget
                id="test-widget"
                title="// TEST WIDGET"
                defaultPos={defaultPos}
                defaultSize={defaultSize}
                editModeWidgetId="test-widget"
                setEditModeWidgetId={vi.fn()}
            >
                <div>Hello</div>
            </Widget>
        );

        const outerDiv = container.querySelector('#test-widget');
        expect(outerDiv).toHaveClass('is-editing');
    });

    it('handles Enter key press to zoom in (triggers setEditModeWidgetId)', () => {
        const setEditModeWidgetIdMock = vi.fn();
        const { container } = render(
            <Widget
                id="test-widget"
                title="// TEST WIDGET"
                defaultPos={defaultPos}
                defaultSize={defaultSize}
                editModeWidgetId={null}
                setEditModeWidgetId={setEditModeWidgetIdMock}
            >
                <div>Content</div>
            </Widget>
        );

        const widgetEl = container.querySelector('#test-widget');
        fireEvent.keyDown(widgetEl, { key: 'Enter' });
        expect(setEditModeWidgetIdMock).toHaveBeenCalledWith('test-widget');
    });

    it('handles Escape key press to zoom out (triggers setEditModeWidgetId with null)', () => {
        const setEditModeWidgetIdMock = vi.fn();
        const { container } = render(
            <Widget
                id="test-widget"
                title="// TEST WIDGET"
                defaultPos={defaultPos}
                defaultSize={defaultSize}
                editModeWidgetId="test-widget"
                setEditModeWidgetId={setEditModeWidgetIdMock}
            >
                <div>Content</div>
            </Widget>
        );

        const widgetEl = container.querySelector('#test-widget');
        fireEvent.keyDown(widgetEl, { key: 'Escape' });
        expect(setEditModeWidgetIdMock).toHaveBeenCalledWith(null);
    });
});
