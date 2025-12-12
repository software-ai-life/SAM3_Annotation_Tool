"""
Export API Router - COCO JSON format export
"""
import cv2
from datetime import datetime
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import numpy as np

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
    format: Optional[str] = "polygon"  # "polygon" (CVAT 相容) 或 "rle"


def rle_to_binary_mask(rle: dict) -> np.ndarray:
    """Convert uncompressed RLE to binary mask"""
    counts = rle.get("counts", [])
    size = rle.get("size", [0, 0])
    height, width = size
    
    mask = np.zeros(height * width, dtype=np.uint8)
    idx = 0
    value = 0
    
    for count in counts:
        mask[idx:idx + count] = value
        idx += count
        value = 1 - value
    
    return mask.reshape((height, width), order='C')


def mask_to_polygon(mask: np.ndarray, simplify_tolerance: float = 1.0) -> List[List[float]]:
    """Convert binary mask to polygon format (CVAT compatible)
    
    Returns a list of polygons, where each polygon is [x1,y1,x2,y2,...] 
    """
    # 確保 mask 是 uint8 格式
    mask_uint8 = (mask * 255).astype(np.uint8)
    
    # 使用 OpenCV 找輪廓
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    polygons = []
    for contour in contours:
        # 簡化輪廓以減少頂點數量
        if simplify_tolerance > 0:
            epsilon = simplify_tolerance
            contour = cv2.approxPolyDP(contour, epsilon, True)
        
        # 至少需要 3 個點才能形成多邊形
        if len(contour) >= 3:
            # 將輪廓轉換為 [x1,y1,x2,y2,...] 格式
            polygon = []
            for point in contour:
                x, y = point[0]
                polygon.extend([float(x), float(y)])
            
            # COCO 要求至少 6 個值（3 個點）
            if len(polygon) >= 6:
                polygons.append(polygon)
    
    return polygons


def convert_rle_to_polygon(rle: dict) -> List[List[float]]:
    """Convert RLE to polygon format for CVAT compatibility"""
    try:
        mask = rle_to_binary_mask(rle)
        polygons = mask_to_polygon(mask)
        return polygons if polygons else []
    except Exception as e:
        print(f"Warning: RLE to polygon conversion failed: {e}")
        return []


def convert_rle_for_cvat(rle: dict) -> dict:
    """Convert RLE to uncompressed format for CVAT
    
    Returns RLE in format: {"counts": [int, ...], "size": [height, width]}
    """
    counts = rle.get("counts", [])
    size = rle.get("size", [0, 0])
    
    # If already a string (compressed), return as is
    if isinstance(counts, str):
        return rle
    
    # Return uncompressed format
    return {
        "counts": [int(c) for c in counts],
        "size": [int(s) for s in size]
    }


def convert_to_coco_format(export_data: ExportRequest, use_polygon: bool = True) -> Dict[str, Any]:
    """Convert annotations to COCO format compatible with CVAT
    
    Args:
        export_data: The export request data
        use_polygon: If True, convert RLE to polygon format (CVAT default)
                    If False, keep RLE format
    """
    
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
                "id": 0,
                "name": "",
                "url": ""
            }
        ],
        "images": [],
        "annotations": [],
        "categories": []
    }
    
    # Process images - 使用原始檔名（CVAT 需要匹配）
    image_id_map = {}
    for idx, img in enumerate(export_data.images, start=1):
        image_id_map[img["id"]] = idx
        coco_output["images"].append({
            "id": idx,
            "file_name": img.get("file_name", f"image_{idx}.jpg"),
            "width": img["width"],
            "height": img["height"],
            "license": 0,
            "flickr_url": "",
            "coco_url": "",
            "date_captured": 0
        })
    
    # Process categories - 使用原始名稱（CVAT label 名稱匹配）
    # COCO category_id 從 1 開始
    category_id_map = {}
    category_name_to_id = {}
    for idx, cat in enumerate(export_data.categories, start=1):
        original_id = cat.get("id", idx)
        category_id_map[original_id] = idx
        category_name_to_id[cat["name"]] = idx
        coco_output["categories"].append({
            "id": idx,
            "name": cat["name"],
            "supercategory": cat.get("supercategory", "")
        })
    
    # Process annotations
    for ann_idx, ann in enumerate(export_data.annotations, start=1):
        # Convert image_id string to numeric
        numeric_image_id = image_id_map.get(ann.image_id, 1)
        
        # 優先使用 category_name 來找對應的 category_id（更可靠）
        if ann.category_name in category_name_to_id:
            numeric_category_id = category_name_to_id[ann.category_name]
        else:
            numeric_category_id = category_id_map.get(ann.category_id, 1)
        
        # 根據格式選擇轉換方式
        if use_polygon:
            # 轉換為 Polygon 格式（CVAT 預設格式）
            polygons = convert_rle_to_polygon(ann.segmentation)
            if not polygons:
                print(f"Warning: Annotation {ann_idx} could not be converted to polygon, skipping")
                continue
            segmentation = polygons
            iscrowd = 0
        else:
            # 保持 RLE 格式
            segmentation = convert_rle_for_cvat(ann.segmentation)
            iscrowd = 1
        
        coco_ann = {
            "id": ann_idx,
            "image_id": numeric_image_id,
            "category_id": numeric_category_id,
            "segmentation": segmentation,
            "bbox": [float(b) for b in ann.bbox],
            "area": float(ann.area),
            "iscrowd": iscrowd,
            "attributes": {"occluded": False}  # CVAT 預設屬性
        }
        coco_output["annotations"].append(coco_ann)
    
    return coco_output


@router.post("/export/coco")
async def export_coco(request: ExportRequest):
    """Export annotations in COCO JSON format
    
    format parameter:
    - "polygon" (default): Convert to polygon format, compatible with CVAT
    - "rle": Keep RLE format
    """
    try:
        use_polygon = request.format != "rle"
        coco_data = convert_to_coco_format(request, use_polygon=use_polygon)
        
        return JSONResponse(
            content=coco_data,
            headers={
                "Content-Disposition": "attachment; filename=instances_default.json"
            }
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@router.post("/export/coco/validate")
async def validate_coco(request: ExportRequest):
    """Validate COCO format before export"""
    try:
        use_polygon = request.format != "rle"
        coco_data = convert_to_coco_format(request, use_polygon=use_polygon)
        
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
            "format": "polygon" if use_polygon else "rle",
            "summary": {
                "images": len(coco_data["images"]),
                "annotations": len(coco_data["annotations"]),
                "categories": len(coco_data["categories"])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Validation failed: {str(e)}")
