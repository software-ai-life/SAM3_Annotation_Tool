"""
Annotation API Router
"""
import uuid
import base64
from io import BytesIO
from typing import List

from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import Response
from PIL import Image

from app.models.schemas import (
    TextPromptRequest,
    PointPromptRequest,
    BoxPromptRequest,
    TemplatePromptRequest,
    SegmentationResponse,
    SegmentationResult,
    ImageInfo,
    ImageInfoWithData,
    RegisterImageRequest
)
from app.services.sam3_service import sam3_model

router = APIRouter()

# 儲存原始圖片用於前端顯示
_image_cache: dict[str, Image.Image] = {}


@router.post("/upload", response_model=ImageInfoWithData)
async def upload_image(file: UploadFile = File(...)):
    """Upload an image for annotation"""
    try:
        # Read and validate image
        contents = await file.read()
        image = Image.open(BytesIO(contents)).convert("RGB")
        
        # Generate unique image ID
        image_id = str(uuid.uuid4())
        
        # Store image in model (CPU only, lazy GPU encoding)
        sam3_model.register_image(image_id, image)
        
        # 也儲存到 cache 供前端取得
        _image_cache[image_id] = image
        
        # 將圖片轉換為 base64 JPEG 供前端顯示
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=92)
        buffer.seek(0)
        image_base64 = base64.b64encode(buffer.read()).decode('utf-8')
        image_data_url = f"data:image/jpeg;base64,{image_base64}"
        
        return ImageInfoWithData(
            id=image_id,
            file_name=file.filename or "unknown.jpg",
            width=image.width,
            height=image.height,
            image_url=image_data_url
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to process image: {str(e)}")


@router.get("/image/{image_id}")
async def get_image(image_id: str):
    """Get image as JPEG for display"""
    if image_id not in _image_cache:
        raise HTTPException(status_code=404, detail="Image not found")
    
    image = _image_cache[image_id]
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=92)
    buffer.seek(0)
    
    return Response(content=buffer.read(), media_type="image/jpeg")


@router.post("/register-image", response_model=ImageInfo)
async def register_image(request: RegisterImageRequest):
    """Register an image from base64 data (for CVAT loaded images)
    
    This allows images loaded from CVAT to be registered with the SAM3 model
    without going through the file upload process.
    """
    try:
        # Parse base64 data URL
        if not request.image_data.startswith('data:'):
            raise HTTPException(status_code=400, detail="Invalid image data format. Expected data URL.")
        
        # Extract base64 content
        header, base64_data = request.image_data.split(',', 1)
        image_bytes = base64.b64decode(base64_data)
        
        # Load image
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
        
        # Register with SAM3 model (lazy loading - no GPU encoding yet)
        sam3_model.register_image(request.image_id, image)
        
        # Also store in cache
        _image_cache[request.image_id] = image
        
        print(f"[register_image] Registered image {request.image_id}, size={image.width}x{image.height} (CPU only, lazy GPU encoding)")
        
        return ImageInfo(
            id=request.image_id,
            file_name=request.file_name,
            width=image.width,
            height=image.height
        )
    except Exception as e:
        print(f"[register_image] Error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to register image: {str(e)}")


@router.post("/segment/text", response_model=SegmentationResponse)
async def segment_with_text(request: TextPromptRequest):
    """Segment image using text prompt"""
    try:
        print(f"[segment_with_text] image_id={request.image_id}, prompt={request.prompt}")
        results = sam3_model.segment_with_text(
            image_id=request.image_id,
            prompt=request.prompt,
            confidence_threshold=request.confidence_threshold
        )
        print(f"[segment_with_text] results count: {len(results)}")
        
        return SegmentationResponse(
            image_id=request.image_id,
            results=[SegmentationResult(**r) for r in results]
        )
    except ValueError as e:
        print(f"[segment_with_text] ValueError: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        import traceback
        print(f"[segment_with_text] Exception: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")


@router.post("/segment/points", response_model=SegmentationResponse)
async def segment_with_points(request: PointPromptRequest):
    """Segment image using point prompts (positive and negative points)
    
    When reset_mask=True, starts fresh without using previous mask logits.
    When reset_mask=False (default), uses previous mask for refinement.
    """
    try:
        points = [(p.x, p.y, p.label) for p in request.points]
        
        results = sam3_model.segment_with_points(
            image_id=request.image_id,
            points=points,
            confidence_threshold=request.confidence_threshold,
            reset_mask=request.reset_mask
        )
        
        return SegmentationResponse(
            image_id=request.image_id,
            results=[SegmentationResult(**r) for r in results]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")


@router.post("/segment/reset-mask/{image_id}")
async def reset_mask_state(image_id: str):
    """Reset mask refinement state for an image
    
    Call this when starting a new annotation to ensure fresh predictions.
    """
    try:
        reset = sam3_model.reset_mask_state(image_id)
        return {"success": True, "reset": reset, "image_id": image_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")


@router.post("/segment/box", response_model=SegmentationResponse)
async def segment_with_box(request: BoxPromptRequest):
    """Segment image using box prompt"""
    try:
        box = (request.box.x1, request.box.y1, request.box.x2, request.box.y2)
        
        results = sam3_model.segment_with_box(
            image_id=request.image_id,
            box=box,
            label=request.label,
            confidence_threshold=request.confidence_threshold
        )
        
        return SegmentationResponse(
            image_id=request.image_id,
            results=[SegmentationResult(**r) for r in results]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")


@router.post("/segment/template", response_model=SegmentationResponse)
async def segment_with_template(request: TemplatePromptRequest):
    """Segment image using visual prompt (box as exemplar)"""
    try:
        template_box = (
            request.template_box.x1,
            request.template_box.y1,
            request.template_box.x2,
            request.template_box.y2
        )
        
        results = sam3_model.segment_with_template(
            image_id=request.image_id,
            template_image_id=request.template_image_id,
            template_box=template_box,
            confidence_threshold=request.confidence_threshold
        )
        
        return SegmentationResponse(
            image_id=request.image_id,
            results=[SegmentationResult(**r) for r in results]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation failed: {str(e)}")


@router.post("/reset/{image_id}")
async def reset_prompts(image_id: str):
    """Reset all prompts for an image"""
    try:
        sam3_model.reset_prompts(image_id)
        return {"status": "success", "message": f"Prompts reset for image {image_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
