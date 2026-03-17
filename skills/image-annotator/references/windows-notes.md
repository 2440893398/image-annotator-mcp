# Windows Usage Notes

Running the Image Annotator on Windows requires attention to shell-specific quoting and display scaling.

## JSON Quoting

Passing JSON via the command line varies by shell.

### Command Prompt (CMD)
Use double quotes for the argument and escape internal double quotes with a backslash.
```cmd
node annotate.js in.png out.png --annotations "[{\"type\":\"marker\",\"x\":100,\"y\":100,\"number\":1}]"
```

### PowerShell
PowerShell requires more complex escaping or using a single-quoted string with internal double quotes.
```powershell
node annotate.js in.png out.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```

### Git Bash / WSL
Standard single quotes for the argument work best.
```bash
node annotate.js in.png out.png --annotations '[{"type":"marker","x":100,"y":100,"number":1}]'
```

## Device Pixel Ratio (DPR) & Retina

Windows "Display Scaling" (e.g., 150% or 200%) affects how screenshots are captured.

### The Problem
If your display is set to 200% scaling (DPR 2), a 1920x1080 browser window will produce a 3840x2160 screenshot. However, Playwright's `getBoundingClientRect()` returns coordinates in "CSS pixels" (1920x1080).

### The Solution
1. **Manual Scaling**: Multiply all coordinates by the DPR before passing them to the CLI.
   - CSS X: 100 -> Image X: 200 (for DPR 2)
2. **CLI Flag**: Use the `--device-pixel-ratio` flag when using subcommands like `step-guide` to ensure internal offsets scale correctly.

```bash
# Example for a 2x Retina/HiDPI display
node annotate.js in.png out.png --device-pixel-ratio 2 --annotations '[{"type":"marker","x":200,"y":200,"number":1}]'
```

## Path Handling
Windows uses backslashes (`\`) for paths, but Node.js and the Image Annotator CLI handle forward slashes (`/`) correctly. It is often safer to use forward slashes in scripts to avoid escaping issues.

```bash
# Both work, but forward slashes are often easier in JSON
node annotate.js C:/Users/Name/Desktop/in.png C:/Users/Name/Desktop/out.png ...
```

## Performance
The tool uses `sharp`, which is a high-performance native module. On Windows, ensure you have the necessary build tools if you are installing from source, though the pre-built binaries usually work out of the box.
