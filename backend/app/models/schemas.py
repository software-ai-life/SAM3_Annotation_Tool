"""
Pydantic models for request/response schemas
"""
from typing import List, Optional, Tuple
from pydantic import BaseModel


class Point(BaseModel):
    """A point with x, y coordinates and label (positive=1, negative=0)"""
    x: float
    y: float
    label: int = 1  # 1 for positive, 0 for negative


class Box(BaseModel):
    """A bounding box with x1, y1, x2, y2 coordinates"""
    x1: float
    y1: float
    x2: float
    y2: float


class TextPromptRequest(BaseModel):
    """Request for text-based segmentation"""
    image_id: str
    prompt: str
    confidence_threshold: float = 0.5


class PointPromptRequest(BaseModel):
    """Request for point-based segmentation"""
    image_id: str
    points: List[Point]
    confidence_threshold: float = 0.5
    reset_mask: bool = False  # Set True to start fresh annotation without using previous mask logits


class BoxPromptRequest(BaseModel):
    """Request for box-based segmentation"""
    image_id: str
    box: Box
    label: bool = True  # True for positive, False for negative
    confidence_threshold: float = 0.5


class TemplatePromptRequest(BaseModel):
    """Request for template-based segmentation"""
    image_id: str
    template_image_id: str  # Reference image containing the template
    template_box: Box  # Region in the template image
    confidence_threshold: float = 0.5


class SegmentationResult(BaseModel):
    """Segmentation result with mask, box, and score"""
    mask_rle: dict  # RLE encoded mask
    box: List[float]  # [x1, y1, x2, y2]
    score: float
    area: int


class SegmentationResponse(BaseModel):
    """Response containing segmentation results"""
    image_id: str
    results: List[SegmentationResult]


class Annotation(BaseModel):
    """A single annotation"""
    id: int
    image_id: str
    category_id: int
    category_name: str
    segmentation: dict  # RLE format
    bbox: List[float]  # [x, y, width, height] in COCO format
    area: float
    score: float
    iscrowd: int = 0


class ImageInfo(BaseModel):
    """Image information"""
    id: str
    file_name: str
    width: int
    height: int


class ImageInfoWithData(BaseModel):
    """Image information with base64 image data for display"""
    id: str
    file_name: str
    width: int
    height: int
    image_url: str  # data:image/jpeg;base64,... format


class Category(BaseModel):
    """Category information"""
    id: int
    name: str
    supercategory: str = ""


class COCOAnnotation(BaseModel):
    """COCO format annotation export"""
    images: List[dict]
    annotations: List[dict]
    categories: List[dict]
