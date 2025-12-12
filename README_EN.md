**🌐 Language: English | [繁體中文](README.md)**

# SAM3 Annotation Tool

An image annotation tool based on Meta SAM3 (Segment Anything with Concepts), featuring an intuitive user interface and multiple annotation methods.

## Installation & Execution

### System Requirements

- Python 3.12+
- Node.js 18+
- CUDA-compatible GPU (recommended for SAM3)
- PyTorch 2.7+

### Recommended Docker Deployment

```bash
# docker build
docker build -t sam3_annotation .
```

```bash
# Start using docker-compose
docker-compose up -d
```
docker compose will execute start.sh to start both frontend and backend services.


### (Other) Virtual Environment - Backend Installation

```bash
# Enter backend directory
cd backend

# Create virtual environment and install dependencies using uv
uv venv --python 3.12
uv pip install -r requirements.txt

# Or use traditional method
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Install SAM3
git clone https://github.com/facebookresearch/sam3.git
cd sam3
uv pip install -e .
cd ..

# Start service
uv run uvicorn app.main:app --host 0.0.0.0 --port 5341 --reload

# Or specify GPU index
SAM3_GPU_INDEX=1 uv run uvicorn app.main:app --host 0.0.0.0 --port 5341 --reload
```

### Frontend Installation

```bash
# Enter frontend directory
cd frontend

# Install dependencies
npm install

# Start in development mode
npm run dev

# Or build for production
npm run build
npm run preview
```

### Access the Application

Open your browser and navigate to http://localhost:5702

## Features

### 🎯 Annotation Methods

1. **Text Prompt**
   - Enter descriptive text like "red car" or "person in white shirt"
   - SAM3 automatically identifies and segments all matching objects

2. **Point Prompts**
   - **Positive (+)**: Left-click on the object area to segment
   - **Negative (-)**: Right-click on areas to exclude
   - Supports multi-point combinations for precise control
   - Real-time preview, press Enter to confirm

3. **Box Prompt**
   - Drag to draw a bounding box
   - Quick selection of target area

4. **Template Matching**
   - Select an object in a reference image as template
   - Automatically find similar objects in the target image

5. **Manual Polygon Tool**
   - Fallback option when SAM3 is unavailable
   - Manually click to draw polygon vertices
   - Dynamic preview, click start point or press Enter to close

### 🖌️ Fine-Tuning Features

- **Control Point Dragging**: Drag boundary control points to adjust contours after selecting an annotation
- **Double-Click to Add Control Points**: In edit mode, double-click on boundary lines to add extra control points
  - Green + indicator appears when hovering over boundary lines
  - Useful when boundary points are insufficient or more precise adjustments needed
- **Fixed Visual Size**: Control points maintain consistent visual size regardless of canvas zoom level

### 🖱️ Canvas Operations

- **Mouse Wheel Zoom**: Zoom in/out centered at mouse position
- **Middle-Click Drag**: Hold middle mouse button (scroll wheel) to pan canvas in any tool mode
- **Pointer Tool Drag**: Drag to pan canvas when using pointer tool (V)

### 📦 Export Format

- **COCO JSON + Images ZIP**: Full COCO annotation format support
  - Includes image info, mask annotations (RLE), bounding boxes, categories
  - Automatically packages annotations JSON and all images into ZIP
  - Ready for deep learning training

### 💾 Auto Save

- Automatically saves annotation data to browser LocalStorage
- Recover unsaved annotations after unexpected page closure
- No manual action required, auto-saves every 2 seconds

### 📋 Copy & Paste and Multi-Select

- **Copy & Paste**: 
  - `Ctrl + C` to copy selected annotations
  - `Ctrl + V` to enter paste mode, paste to other positions or images
- **Multi-Select Support**:
  - `Ctrl/Cmd + Click`: Multi-select individual annotations (add/remove)
  - `Shift + Click`: Range selection (Excel-like, select all between two points)
  
### 🏷️ Category Management

- **Quick Category Change**: Change annotation category via Tag button after completion
- **Visual Indication**: Dropdown menu highlights current category
- **Instant Update**: Annotation color updates immediately after category change

## Keyboard Shortcuts

### Tool Switching
| Shortcut | Function |
|----------|----------|
| `V` | Selection tool (pan/zoom) |
| `+` or `=` | Add point tool |
| `-` | Remove point tool |
| `B` | Box selection tool |
| `T` | Text prompt tool |
| `M` | Template matching tool |
| `P` | Manual polygon tool |

### Edit Operations
| Shortcut | Function |
|----------|----------|
| `Ctrl + Z` | Undo |
| `Ctrl + Y` or `Ctrl + Shift + Z` | Redo |
| `Delete` or `Backspace` | Delete selected annotations |
| `Ctrl + C` | Copy selected annotations |
| `Ctrl + V` | Paste annotations (enter paste mode) |

### Selection Operations
| Shortcut | Function |
|----------|----------|
| `Ctrl + A` | Select all annotations |
| `Ctrl + D` | Deselect all |
| `Ctrl/Cmd + Click` | Multi-select individual annotations (add/remove) |
| `Shift + Click` | Range selection (select all between two points) |
| `Escape` | Cancel current operation / clear temp points |
| `Enter` or `Space` | Confirm current annotation |

### Canvas Operations
| Operation | Function |
|-----------|----------|
| `Mouse Wheel` | Zoom canvas centered at mouse position |
| `Middle-Click Drag` | Pan canvas in any tool mode |
| `Double-Click Boundary` | Add control point in edit mode |

### Quick Category Selection
| Shortcut | Function |
|----------|----------|
| `1` - `9` | Quick select category 1-9 |

### Others
| Shortcut | Function |
|----------|----------|
| `?` or `Ctrl + /` | Show keyboard shortcuts |

## Project Structure

```
SAM3_annotation/
├── backend/                 # Backend API service
│   ├── app/
│   │   ├── main.py         # FastAPI main entry
│   │   ├── models/         # Pydantic models
│   │   ├── routers/        # API routes
│   │   └── services/       # SAM3 service wrapper
│   └── requirements.txt
│
├── frontend/               # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom Hooks
│   │   ├── services/       # API services
│   │   ├── store/          # Zustand state management
│   │   └── types/          # TypeScript type definitions
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload image |
| POST | `/api/segment/text` | Text prompt segmentation |
| POST | `/api/segment/points` | Point prompt segmentation |
| POST | `/api/segment/box` | Box selection segmentation |
| POST | `/api/segment/template` | Template matching segmentation |
| POST | `/api/export/coco` | Export COCO JSON |
| POST | `/api/reset/{image_id}` | Reset image prompts |

## Usage Workflow

1. **Upload Images**: Click "Upload" button or drag and drop images
2. **Select Category**: Choose or add annotation category in the right panel
3. **Select Tool**: Use toolbar or keyboard shortcuts to select annotation method
4. **Annotate**:
   - **Text**: Enter description and press Enter
   - **Points**: Left-click to add, right-click to remove, press Enter to confirm
   - **Box**: Drag to draw selection box
   - **Polygon**: Click to add vertices, click start point or press Enter to close
5. **Fine-Tune**:
   - Drag control points to adjust boundaries after selecting annotation
   - Double-click boundary lines to add extra control points
   - Use middle mouse button to drag and pan canvas
6. **Manage Annotations**: 
   - View, select, hide, or delete in the right panel list
   - Use Tag button to quickly change annotation category
   - `Shift + Click` for range multi-select
7. **Copy & Paste**: Select annotations with `Ctrl+C`, paste with `Ctrl+V`
8. **Export Results**: Click "Export" to download ZIP containing COCO JSON and images

## Tech Stack

### Backend
- **FastAPI**: High-performance Python web framework
- **SAM3**: Meta's latest segmentation model
- **PyTorch**: Deep learning framework
- **Pydantic**: Data validation

### Frontend
- **React 18**: UI framework
- **TypeScript**: Type safety
- **Vite**: Fast build tool
- **Tailwind CSS**: Styling framework
- **Zustand**: State management
- **Lucide React**: Icon library
- **JSZip**: ZIP file packaging

## License

This project is licensed under MIT. For SAM3 model licensing, please refer to [Facebook Research SAM3](https://github.com/facebookresearch/sam3).

## References

- [SAM3: Segment Anything with Concepts](https://github.com/facebookresearch/sam3)
- [COCO Dataset Format](https://cocodataset.org/#format-data)
