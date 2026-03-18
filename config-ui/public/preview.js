// Configuration state
const state = {
  sizePreset: 'm',
  autoSize: true,
  theme: 'documentation',
  markerColor: 'primary',
  markerSize: 32,
  arrowWidth: 5,
  labelFontSize: 20
};

// Size preset suggestions
const sizeSuggestions = {
  xs: '< 400px',
  s: '400-800px',
  m: '800-1200px',
  l: '1200-1920px',
  xl: '> 1920px'
};

// Theme color mapping
const colorMap = {
  primary: '#1976D2',
  error: '#F44336',
  success: '#43A047',
  warning: '#FF9800'
};

// Theme font mapping
const fontMap = {
  documentation: 'Inter, sans-serif',
  tutorial: 'Nunito, sans-serif',
  bugReport: 'JetBrains Mono, monospace',
  highlight: 'Noto Sans, sans-serif'
};

// Theme to marker color mapping
const themeColorMap = {
  documentation: 'primary',
  tutorial: 'success',
  bugReport: 'error',
  highlight: 'warning'
};

// Theme to annotation color mapping
const themeAnnotationColor = {
  documentation: 'primary',
  tutorial: 'green',
  bugReport: 'error',
  highlight: 'orange'
};

// Default values per theme
const themeDefaults = {
  documentation: { markerSize: 32, arrowWidth: 5, labelFontSize: 20 },
  tutorial: { markerSize: 36, arrowWidth: 6, labelFontSize: 22 },
  bugReport: { markerSize: 32, arrowWidth: 5, labelFontSize: 20 },
  highlight: { markerSize: 32, arrowWidth: 5, labelFontSize: 20 }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadCurrentConfig();
  setupEventListeners();
  updatePreview();
});

function loadCurrentConfig() {
  fetch('/api/config')
    .then(res => res.json())
    .then(config => {
      state.sizePreset = config.sizePreset === 'auto' ? 'm' : (config.sizePreset || 'm');
      state.autoSize = config.sizePreset === 'auto' || !config.sizePreset;
      state.theme = config.theme || 'documentation';
      if (config.defaultSizes && typeof config.defaultSizes === 'object') {
        if (config.defaultSizes.markerSize != null) state.markerSize = config.defaultSizes.markerSize;
        if (config.defaultSizes.strokeWidth != null) state.arrowWidth = config.defaultSizes.strokeWidth;
        if (config.defaultSizes.fontSize != null) state.labelFontSize = config.defaultSizes.fontSize;
      }
      state.markerColor = themeColorMap[state.theme] || 'primary';
      updateUI();
      updatePreview();
    })
    .catch(() => {
      console.log('Using default configuration');
    });
}

function setupEventListeners() {
  // Size presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      state.sizePreset = btn.dataset.size;
      updatePreview();
    });
  });

  // Auto size toggle
  document.getElementById('autoSize').addEventListener('change', (e) => {
    state.autoSize = e.target.checked;
    if (state.autoSize) {
      updatePreview();
    }
  });

  // Theme selection
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      state.theme = btn.dataset.theme;

      // Update marker color based on theme
      state.markerColor = themeColorMap[state.theme] || 'primary';

      // Apply theme defaults
      const defaults = themeDefaults[state.theme];
      state.markerSize = defaults.markerSize;
      state.arrowWidth = defaults.arrowWidth;
      state.labelFontSize = defaults.labelFontSize;

      // Update form values
      document.getElementById('markerColor').value = state.markerColor;
      document.getElementById('markerSize').value = state.markerSize;
      document.getElementById('arrowWidth').value = state.arrowWidth;
      document.getElementById('labelFontSize').value = state.labelFontSize;

      updatePreview();
    });
  });

  // Marker color
  document.getElementById('markerColor').addEventListener('change', (e) => {
    state.markerColor = e.target.value;
    updatePreview();
  });

  // Marker size
  document.getElementById('markerSize').addEventListener('input', (e) => {
    state.markerSize = parseInt(e.target.value) || 32;
    updatePreview();
  });

  // Arrow width
  document.getElementById('arrowWidth').addEventListener('input', (e) => {
    state.arrowWidth = parseInt(e.target.value) || 5;
    updatePreview();
  });

  // Label font size
  document.getElementById('labelFontSize').addEventListener('input', (e) => {
    state.labelFontSize = parseInt(e.target.value) || 20;
    updatePreview();
  });

  // Reset theme
  document.getElementById('resetTheme').addEventListener('click', () => {
    const defaults = themeDefaults[state.theme];

    state.markerColor = themeColorMap[state.theme];
    state.markerSize = defaults.markerSize;
    state.arrowWidth = defaults.arrowWidth;
    state.labelFontSize = defaults.labelFontSize;

    document.getElementById('markerColor').value = state.markerColor;
    document.getElementById('markerSize').value = state.markerSize;
    document.getElementById('arrowWidth').value = state.arrowWidth;
    document.getElementById('labelFontSize').value = state.labelFontSize;

    updatePreview();
  });

  // Export button
  document.getElementById('exportBtn').addEventListener('click', saveConfig);
}

function updateUI() {
  // Update preset buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.size === state.sizePreset);
  });

  // Update suggested size
  document.getElementById('suggestedSize').textContent =
    `${state.sizePreset} (${sizeSuggestions[state.sizePreset]})`;

  // Update auto size checkbox
  document.getElementById('autoSize').checked = state.autoSize;

  // Update theme buttons
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === state.theme);
  });

  // Update form values
  document.getElementById('markerColor').value = state.markerColor;
  document.getElementById('markerSize').value = state.markerSize;
  document.getElementById('arrowWidth').value = state.arrowWidth;
  document.getElementById('labelFontSize').value = state.labelFontSize;
}

function updatePreview() {
  // Get annotation color based on marker color selection
  const annotationColor = state.markerColor;

  // Resolve sizes: use getSizePreset when autoSize is enabled
  const PREVIEW_WIDTH = 250;
  const PREVIEW_HEIGHT = 180;
  const resolvedPresetName = state.autoSize && typeof getSizePreset === 'function'
    ? getSizePreset(PREVIEW_WIDTH, PREVIEW_HEIGHT)
    : state.sizePreset;
  let markerSize, arrowWidth, labelFontSize;
  if (state.autoSize && typeof getSizePreset === 'function') {
    const preset = SIZE_PRESETS[resolvedPresetName];
    markerSize = preset.markerSize;
    arrowWidth = preset.strokeWidth;
    labelFontSize = preset.fontSize;
  } else {
    markerSize = state.markerSize;
    arrowWidth = state.arrowWidth;
    labelFontSize = state.labelFontSize;
  }

  // Use shared renderer to build preview SVG
  // Create sample annotations that demonstrate current settings
  const sampleAnnotations = [
    // Marker
    {
      type: 'marker',
      x: 60,
      y: 60,
      number: 1,
      color: annotationColor,
      size: markerSize,
      style: 'filled',
      shadow: true
    },
    // Arrow
    {
      type: 'arrow',
      from: [90, 90],
      to: [180, 60],
      color: annotationColor,
      strokeWidth: arrowWidth,
      style: 'solid',
      headStyle: 'filled',
      shadow: true
    },
    // Label
    {
      type: 'label',
      x: 60,
      y: 130,
      text: '标注文字',
      color: 'darkGray',
      fontSize: labelFontSize,
      background: 'white',
      padding: 10,
      shadow: true,
      handwriting: true
    }
  ];

  // Build SVG using shared renderer
  const svg = buildSvg(250, 180, sampleAnnotations, 'config-preview');

  // Convert to inline SVG
  const svgInline = svg.replace(/<\?xml[^?]*\?>\s*/i, '').trim();

  // Update preview container
  const previewContainer = document.getElementById('preview');
  previewContainer.innerHTML = `<div class="preview-canvas">${svgInline}</div>`;

  // Update suggested size display
  document.getElementById('suggestedSize').textContent =
    `${resolvedPresetName} (${sizeSuggestions[resolvedPresetName]})`;
}

async function saveConfig() {
  const config = {
    version: '1.0',
    sizePreset: state.autoSize ? 'auto' : state.sizePreset,
    theme: state.theme,
    themes: null,  // Use built-in themes
    defaultSizes: {
      markerSize: state.markerSize,
      strokeWidth: state.arrowWidth,
      fontSize: state.labelFontSize
    }
  };

  try {
    const response = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        config,
        targetPath: '.image-annotator.json'
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(`配置已保存到: ${result.savedTo}\n\n后续调用 annotate_screenshot 将自动使用此配置。`);
    } else {
      alert('保存失败: ' + result.error);
    }
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}
