# Focus Mode

A ComfyUI extension that lets you select a subset of nodes and view them in an isolated, full-screen panel — free from canvas scrolling.

## Why I built this

I was getting frustrated with the amount of scrolling around the canvas I had to do with large workflows. I like having access to the complete workflow to fine-tune it now and then, but when I feel that it's working and switch to "production mode" where I just want to generate, I realised I only need access to a handful of nodes — be it an image or video loader, the prompt node, the save image/audio/video nodes, and maybe a couple of others. But these tend to be all over the canvas.

With this extension you can focus on exactly the nodes you need, grouped together in a clean panel.

## Features

- **Focus Panel** — right-click any node and add it to the panel, or select multiple nodes and toggle focus mode
- **Full-screen isolation** — non-focus nodes and connections are hidden, giving you a clutter-free view
- **Drag to rearrange** — positions are remembered when you exit and re-enter focus mode
- **Persistence** — your node selection and layout are saved with the workflow and to localStorage
- **Keyboard shortcuts** — `Ctrl+Shift+P` to toggle, `Esc` to exit

## Install

Clone into your `ComfyUI/custom_nodes/` folder:

```bash
cd ComfyUI/custom_nodes/
git clone https://github.com/mmoalem/comfyui-focus-mode.git
```

Restart ComfyUI. A ⊞ Focus button appears in the top toolbar (or use `Extensions > Focus Panel` in the menu).

## Usage

1. **Add nodes** — right-click a node → "Add to Focus Panel", or select multiple nodes and click ⊞ Focus
2. **Toggle focus mode** — click the ⊞ Focus button in the toolbar, or press `Ctrl+Shift+P`
3. **Exit** — click ⊞ Exit Focus, press `Ctrl+Shift+P`, or press `Esc`
4. **Rearrange** — drag nodes around in the panel; their positions are remembered next time you enter focus mode
