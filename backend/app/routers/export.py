"""
Export API Router - COCO JSON format export
"""
import json
from datetime import datetime
from typing import List, Dict, Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()


class AnnotationData(BaseModel):
    """Single annotation data for export"""
    id: int
    image_id: str
    category_id: int
    category_name: str
    segmentation: dict  # RLE format
    bbox: List[float]  # [x, y, width, height]
    area: float
    score: float


class ExportRequest(BaseModel):
    """Request for COCO export"""
    images: List[dict]  # Image info list
    annotations: List[AnnotationData]
    categories: List[dict]


def convert_to_coco_format(export_data: ExportRequest) -> Dict[str, Any]:
    """Convert annotations to COCO format"""
    
    # Build COCO structure
    coco_output = {
        "info": {
            "description": "SAM3 Annotation Tool Export",
            "version": "1.0.0",
            "year": datetime.now().year,
            "date_created": datetime.now().isoformat()
        },
        "licenses": [
            {
                "id": 1,
                "name": "Unknown",
                "url": ""
            }
        ],
        "images": [],
        "annotations": [],
        "categories": []
    }
    
    # Process images
    image_id_map = {}
    for idx, img in enumerate(export_data.images, start=1):
        image_id_map[img["id"]] = idx
        coco_output["images"].append({
            "id": idx,
            "file_name": img.get("file_name", f"image_{idx}.jpg"),
            "width": img["width"],
            "height": img["height"]
        })
    
    # Process categories (COCO category_id 從 0 開始)
    category_id_map = {}
    for idx, cat in enumerate(export_data.categories, start=0):
        category_id_map[cat.get("id", idx)] = idx
        coco_output["categories"].append({
            "id": idx,
            "name": cat["name"],
            "supercategory": cat.get("supercategory", "")
        })
    
    # Process annotations
    for ann in export_data.annotations:
        # Convert image_id string to numeric
        numeric_image_id = image_id_map.get(ann.image_id, 1)
        numeric_category_id = category_id_map.get(ann.category_id, ann.category_id)
        
        coco_ann = {
            "id": ann.id,
            "image_id": numeric_image_id,
            "category_id": numeric_category_id,
            "segmentation": ann.segmentation,  # RLE format
            "bbox": ann.bbox,  # [x, y, width, height]
            "area": ann.area,
            "iscrowd": 0,
            "score": ann.score
        }
        coco_output["annotations"].append(coco_ann)
    
    return coco_output


@router.post("/export/coco")
async def export_coco(request: ExportRequest):
    """Export annotations in COCO JSON format"""
    try:
        coco_data = convert_to_coco_format(request)
        
        return JSONResponse(
            content=coco_data,
            headers={
                "Content-Disposition": "attachment; filename=annotations_coco.json"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.post("/export/coco/validate")
async def validate_coco(request: ExportRequest):
    """Validate COCO format before export"""
    try:
        coco_data = convert_to_coco_format(request)
        
        # Basic validation
        errors = []
        
        if not coco_data["images"]:
            errors.append("No images found")
        
        if not coco_data["annotations"]:
            errors.append("No annotations found")
        
        if not coco_data["categories"]:
            errors.append("No categories found")
        
        # Check for valid references
        image_ids = {img["id"] for img in coco_data["images"]}
        category_ids = {cat["id"] for cat in coco_data["categories"]}
        
        for ann in coco_data["annotations"]:
            if ann["image_id"] not in image_ids:
                errors.append(f"Annotation {ann['id']} references invalid image_id {ann['image_id']}")
            if ann["category_id"] not in category_ids:
                errors.append(f"Annotation {ann['id']} references invalid category_id {ann['category_id']}")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "summary": {
                "images": len(coco_data["images"]),
                "annotations": len(coco_data["annotations"]),
                "categories": len(coco_data["categories"])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")
