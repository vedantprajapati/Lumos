---
name: add_widget
description: Instructions for safely adding a new Widget component to the Lumos React dashboard.
---

# Adding a Widget to Lumos

When asked to add a new UI feature or widget to the dashboard, always follow these structural rules to ensure it behaves correctly with the frameless window and edit mode.

## 1. Using the `<Widget>` Wrapper
All new floating UI elements MUST be wrapped in the `Widget` component (`src/Widget.jsx`).

```jsx
<Widget
    id="your-unique-widget-id"
    title="// YOUR TITLE"
    defaultPos={{ x: 100, y: 100 }}
    defaultSize={{ w: 300, h: 200 }}
    editModeWidgetId={editModeWidgetId}
    setEditModeWidgetId={setEditModeWidgetId}
>
    <div className="your-body-content">
        {/* Your content here */}
    </div>
</Widget>
```

## 2. Keyboard Focus & Tab Index
Lumos uses `tabIndex` aggressively to prevent hidden widgets from being accessible via keyboard when they are not in edit mode. 
**Rule:** Any interactive element (button, input, select) inside your widget MUST include the following prop:
`tabIndex={editModeWidgetId === 'your-unique-widget-id' ? 0 : -1}`

## 3. Placement in Views
Lumos now supports Multiple Views via `currentViewIndex`.
Ensure you wrap your new `<Widget>` in a conditional rendering block corresponding to the correct view (usually `currentViewIndex === 0` for the Main Dashboard).
