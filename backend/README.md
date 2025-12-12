# SAM3 Annotation Tool - Backend

This is the backend service for the SAM3 Annotation Tool, providing API endpoints for image segmentation using Meta's SAM3 model.

## Prerequisites

- Python 3.12 or higher
- PyTorch 2.7 or higher
- CUDA-compatible GPU with CUDA 12.6 or higher (recommended)

## Installation

1. Create a virtual environment:
```bash
python -m venv venv
venv\Scripts\activate  # Windows
or 
uv venv --python 3.12
.venv\Scripts\activate
# source venv/bin/activate  # Linux/Mac
```

2. Install dependencies:
```bash
pip3 install -r requirements.txt
```

3. Install SAM3:
```bash
git clone https://github.com/facebookresearch/sam3.git
cd sam3
pip3 install -e .
```

4. Authenticate with Hugging Face:
```bash
huggingface-cli login
```

## Running the Server

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API Endpoints

- `POST /api/upload` - Upload an image
- `POST /api/segment/text` - Segment using text prompt
- `POST /api/segment/points` - Segment using point prompts
- `POST /api/segment/box` - Segment using box prompt
- `POST /api/segment/template` - Segment using template matching
- `GET /api/export/coco` - Export annotations in COCO format
