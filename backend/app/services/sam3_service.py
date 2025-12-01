"""
SAM3 Model Wrapper - Provides unified interface for SAM3 segmentation
"""
import io
import os
import sys
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from PIL import Image

# 設定 SAM3 路徑
# SAM3 內部使用 "from sam3.model.xxx import ..." 的格式
# 所以需要將 backend/sam3/ 加入 path，讓 sam3/ 成為頂層模組
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SAM3_REPO_ROOT = os.path.join(BACKEND_DIR, 'sam3')  # backend/sam3/

if SAM3_REPO_ROOT not in sys.path:
    sys.path.insert(0, SAM3_REPO_ROOT)

# Mock implementation for development without SAM3
SAM3_AVAILABLE = False
build_sam3_image_model = None
Sam3Processor = None

try:
    import torch
    from sam3.model_builder import build_sam3_image_model
    from sam3.model.sam3_image_processor import Sam3Processor
    SAM3_AVAILABLE = True
    print(f"SAM3 loaded successfully from {SAM3_REPO_ROOT}")
except ImportError as e:
    print(f"SAM3 import error: {e}")
    print("Using mock implementation.")


class SAM3Wrapper:
    """Wrapper class for SAM3 model operations"""
    
    def __init__(self, device: str = "cuda"):
        self.device = device if SAM3_AVAILABLE else "cpu"
        self.model = None
        self.processor = None
        self.image_states: Dict[str, Any] = {}
        self.images: Dict[str, Image.Image] = {}
        self.sam3_available = SAM3_AVAILABLE
        
        # Store low_res_masks (logits) for mask refinement
        # Key: image_id, Value: low_res_mask tensor from previous prediction
        self.mask_logits: Dict[str, Any] = {}
        
        if self.sam3_available:
            self._load_model()
    
    def _load_model(self):
        """Load SAM3 model"""
        if not self.sam3_available:
            return
            
        try:
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model = build_sam3_image_model(
                device=device,
                eval_mode=True,
                enable_inst_interactivity=True  # Enable point-based interaction
            )
            self.processor = Sam3Processor(self.model, device=device)
            print(f"SAM3 model loaded successfully on {device}")
        except Exception as e:
            print(f"Failed to load SAM3 model: {e}")
            self.sam3_available = False
    
    def set_image(self, image_id: str, image: Image.Image) -> bool:
        """Set image for processing"""
        self.images[image_id] = image
        
        if self.sam3_available and self.processor:
            state = self.processor.set_image(image)
            self.image_states[image_id] = state
        else:
            # Mock state for development
            self.image_states[image_id] = {
                "width": image.width,
                "height": image.height
            }
        
        return True
    
    def segment_with_text(
        self, 
        image_id: str, 
        prompt: str,
        confidence_threshold: float = 0.5
    ) -> List[Dict]:
        """Segment image using text prompt"""
        if image_id not in self.image_states:
            raise ValueError(f"Image {image_id} not found. Please upload first.")
        
        if self.sam3_available and self.processor:
            state = self.image_states[image_id].copy()
            self.processor.set_confidence_threshold(confidence_threshold)
            result = self.processor.set_text_prompt(prompt, state)
            return self._process_results(result, image_id)
        else:
            # Mock result for development
            return self._generate_mock_results(image_id)
    
    def segment_with_points(
        self,
        image_id: str,
        points: List[Tuple[float, float, int]],  # [(x, y, label), ...]
        confidence_threshold: float = 0.5,
        reset_mask: bool = False  # Whether to start fresh without using previous mask
    ) -> List[Dict]:
        """Segment image using point prompts
        
        Uses SAM3's inst_interactive_predictor (SAM2-style API) for point-based segmentation
        Points format: [(x_pixel, y_pixel, label), ...] where label=1 is positive, label=0 is negative
        
        When multiple points are provided, all points are used together to refine a single mask.
        The mask_input (logits from previous prediction) is used for iterative refinement,
        similar to ISAT's approach.
        """
        if image_id not in self.image_states:
            raise ValueError(f"Image {image_id} not found. Please upload first.")
        
        if self.sam3_available and self.processor:
            import torch
            import numpy as np
            
            image = self.images[image_id]
            w, h = image.width, image.height
            
            print(f"[segment_with_points] Processing {len(points)} points for image {image_id}, size=({w}x{h})")
            
            # Reset mask logits if requested (start of new annotation)
            if reset_mask and image_id in self.mask_logits:
                del self.mask_logits[image_id]
                print(f"[segment_with_points] Reset mask logits for image {image_id}")
            
            # Check if inst_interactive_predictor is available
            if self.processor.model.inst_interactive_predictor is None:
                print("[segment_with_points] inst_interactive_predictor not available, falling back to geometric prompt")
                return self._segment_with_points_geometric(image_id, points, confidence_threshold)
            
            # Use SAM2-style point prediction API
            state = self.image_states[image_id]
            
            # Prepare point coordinates and labels (SAM2 style - pixel coordinates)
            # SAM2/SAM3 expects Nx2 array for point_coords
            point_coords = np.array([[x, y] for x, y, _ in points], dtype=np.float32)
            point_labels = np.array([label for _, _, label in points], dtype=np.int32)
            
            print(f"[segment_with_points] Point coords (pixels): {point_coords}")
            print(f"[segment_with_points] Point labels: {point_labels}")
            
            # Check if we have previous mask logits for refinement
            mask_input = None
            if image_id in self.mask_logits and len(points) > 1:
                mask_input = self.mask_logits[image_id]
                print(f"[segment_with_points] Using previous mask logits for refinement, shape: {mask_input.shape}")
            
            try:
                # Build prediction kwargs
                predict_kwargs = {
                    "inference_state": state,
                    "point_coords": point_coords,
                    "point_labels": point_labels,
                    "normalize_coords": True,  # We're providing pixel coordinates, let SAM normalize them
                }
                
                # For first prediction or single point, use multimask_output=True to get options
                # For refinement with mask_input, use multimask_output=False for deterministic result
                if mask_input is not None:
                    predict_kwargs["mask_input"] = mask_input
                    predict_kwargs["multimask_output"] = False
                else:
                    predict_kwargs["multimask_output"] = True
                
                # Use predict_inst method which wraps inst_interactive_predictor
                masks, iou_scores, low_res_masks = self.processor.model.predict_inst(**predict_kwargs)
                
                print(f"[segment_with_points] Got {len(masks)} masks, scores: {iou_scores}")
                
                # Store the best mask's logits for next refinement
                if len(low_res_masks) > 0:
                    best_idx = np.argmax(iou_scores) if len(iou_scores) > 1 else 0
                    # low_res_masks shape is typically (N, 1, H, W), we want (1, H, W) for mask_input
                    best_logits = low_res_masks[best_idx:best_idx+1]
                    self.mask_logits[image_id] = best_logits
                    print(f"[segment_with_points] Stored mask logits, shape: {best_logits.shape}")
                
                # Process results - return the best mask (highest IoU score)
                results = []
                
                # Find the best mask index
                best_idx = np.argmax(iou_scores) if len(iou_scores) > 0 else 0
                
                for i in range(len(masks)):
                    mask = masks[i]
                    score = float(iou_scores[i]) if i < len(iou_scores) else 0.0
                    
                    # Only include results above threshold, but always include the best one
                    if score < confidence_threshold and i != best_idx:
                        continue
                    
                    # Convert to binary mask
                    binary_mask = (mask > 0).astype(np.uint8)
                    
                    # Calculate bounding box
                    ys, xs = np.where(binary_mask > 0)
                    if len(xs) == 0 or len(ys) == 0:
                        continue
                    
                    x1, x2 = int(xs.min()), int(xs.max())
                    y1, y2 = int(ys.min()), int(ys.max())
                    box = [x1, y1, x2, y2]
                    
                    # Convert to RLE
                    rle = self._mask_to_rle(binary_mask)
                    area = int(np.sum(binary_mask))
                    
                    results.append({
                        "mask_rle": rle,
                        "box": box,
                        "score": score,
                        "area": area
                    })
                
                # Sort by score (highest first)
                results.sort(key=lambda x: x["score"], reverse=True)
                
                print(f"[segment_with_points] Returning {len(results)} results after filtering")
                return results
                
            except Exception as e:
                print(f"[segment_with_points] predict_inst failed: {e}")
                import traceback
                traceback.print_exc()
                # Fall back to geometric prompt
                return self._segment_with_points_geometric(image_id, points, confidence_threshold)
        else:
            # Mock mode: always return a result for development
            print("[segment_with_points] Using mock mode")
            return self._generate_mock_results_at_point(image_id, points)
    
    def reset_mask_state(self, image_id: str) -> bool:
        """Reset the mask refinement state for an image
        
        Call this when starting a new annotation to ensure fresh predictions
        without influence from previous mask logits.
        """
        if image_id in self.mask_logits:
            del self.mask_logits[image_id]
            print(f"[reset_mask_state] Cleared mask logits for image {image_id}")
            return True
        return False
    
    def _segment_with_points_geometric(
        self,
        image_id: str,
        points: List[Tuple[float, float, int]],
        confidence_threshold: float = 0.5
    ) -> List[Dict]:
        """Fallback: use geometric prompt with boxes around points"""
        import torch
        
        state = self.image_states[image_id].copy()
        self.processor.set_confidence_threshold(confidence_threshold)
        
        image = self.images[image_id]
        w, h = image.width, image.height
        
        # Prepare for geometric prompts
        if "backbone_out" not in state:
            raise ValueError("Image state not properly initialized")
        
        if "language_features" not in state["backbone_out"]:
            dummy_text_outputs = self.processor.model.backbone.forward_text(
                ["visual"], device=self.processor.device
            )
            state["backbone_out"].update(dummy_text_outputs)
        
        if "geometric_prompt" not in state:
            state["geometric_prompt"] = self.processor.model._get_dummy_prompt()
        
        # Convert points to small boxes
        for x, y, label in points:
            # Create a small box around the point (5% of image size)
            box_w = 0.05
            box_h = 0.05
            cx, cy = x / w, y / h
            box = [cx, cy, box_w, box_h]
            print(f"[_segment_with_points_geometric] Point ({x}, {y}) label={label} -> box={box}")
            state = self.processor.add_geometric_prompt(
                box=box,
                label=bool(label),
                state=state
            )
        
        return self._process_results(state, image_id)
    
    def segment_with_box(
        self,
        image_id: str,
        box: Tuple[float, float, float, float],  # (x1, y1, x2, y2)
        label: bool = True,
        confidence_threshold: float = 0.5
    ) -> List[Dict]:
        """Segment image using box prompt"""
        if image_id not in self.image_states:
            raise ValueError(f"Image {image_id} not found. Please upload first.")
        
        if self.sam3_available and self.processor:
            state = self.image_states[image_id].copy()
            self.processor.set_confidence_threshold(confidence_threshold)
            
            # Convert box to center format
            image = self.images[image_id]
            w, h = image.width, image.height
            x1, y1, x2, y2 = box
            
            cx = ((x1 + x2) / 2) / w
            cy = ((y1 + y2) / 2) / h
            bw = abs(x2 - x1) / w
            bh = abs(y2 - y1) / h
            
            box_normalized = [cx, cy, bw, bh]
            state = self.processor.add_geometric_prompt(
                box=box_normalized,
                label=label,
                state=state
            )
            
            return self._process_results(state, image_id)
        else:
            return self._generate_mock_results(image_id)
    
    def segment_with_template(
        self,
        image_id: str,
        template_image_id: str,
        template_box: Tuple[float, float, float, float],
        confidence_threshold: float = 0.5
    ) -> List[Dict]:
        """Segment image using template matching (visual exemplar)"""
        if image_id not in self.image_states:
            raise ValueError(f"Image {image_id} not found.")
        if template_image_id not in self.images:
            raise ValueError(f"Template image {template_image_id} not found.")
        
        # Extract template region
        template_image = self.images[template_image_id]
        x1, y1, x2, y2 = template_box
        template_region = template_image.crop((int(x1), int(y1), int(x2), int(y2)))
        
        if self.sam3_available and self.processor:
            # Use geometric prompt with the template region
            state = self.image_states[image_id].copy()
            self.processor.set_confidence_threshold(confidence_threshold)
            
            # SAM3 supports visual prompts through geometric prompts
            # We use the template box as a reference
            image = self.images[image_id]
            w, h = image.width, image.height
            
            cx = ((x1 + x2) / 2) / template_image.width
            cy = ((y1 + y2) / 2) / template_image.height
            bw = abs(x2 - x1) / template_image.width
            bh = abs(y2 - y1) / template_image.height
            
            box_normalized = [cx, cy, bw, bh]
            state = self.processor.add_geometric_prompt(
                box=box_normalized,
                label=True,
                state=state
            )
            
            return self._process_results(state, image_id)
        else:
            return self._generate_mock_results(image_id)
    
    def _process_results(self, state: Dict, image_id: str) -> List[Dict]:
        """Process SAM3 results into standard format"""
        results = []
        
        if "masks" in state and "boxes" in state and "scores" in state:
            masks = state["masks"]
            boxes = state["boxes"]
            scores = state["scores"]
            
            for i in range(len(masks)):
                # 先轉換為 float32 再轉 numpy（避免 BFloat16 不支援的問題）
                mask = masks[i].float().cpu().numpy().squeeze().astype(np.uint8)
                box = boxes[i].float().cpu().numpy().tolist()
                score = float(scores[i].float().cpu().item())
                
                # Convert mask to RLE format
                rle = self._mask_to_rle(mask)
                area = int(np.sum(mask))
                
                results.append({
                    "mask_rle": rle,
                    "box": box,
                    "score": score,
                    "area": area
                })
        
        return results
    
    def _generate_mock_results(self, image_id: str) -> List[Dict]:
        """Generate mock results for development"""
        if image_id not in self.images:
            return []
        
        image = self.images[image_id]
        w, h = image.width, image.height
        
        # Generate a mock circular mask in the center
        mock_mask = np.zeros((h, w), dtype=np.uint8)
        center_y, center_x = h // 2, w // 2
        radius = min(w, h) // 4
        y, x = np.ogrid[:h, :w]
        mask_area = (x - center_x) ** 2 + (y - center_y) ** 2 <= radius ** 2
        mock_mask[mask_area] = 1
        
        rle = self._mask_to_rle(mock_mask)
        area = int(np.sum(mock_mask))
        
        return [{
            "mask_rle": rle,
            "box": [center_x - radius, center_y - radius, 
                   center_x + radius, center_y + radius],
            "score": 0.95,
            "area": area
        }]
    
    def _generate_mock_results_at_point(self, image_id: str, points: List[Tuple[float, float, int]]) -> List[Dict]:
        """Generate mock results at specific point positions for development"""
        if image_id not in self.images or not points:
            return []
        
        image = self.images[image_id]
        w, h = image.width, image.height
        
        # Use the first positive point as the center
        positive_points = [(x, y) for x, y, label in points if label == 1]
        if not positive_points:
            # If no positive points, use first point anyway
            center_x, center_y = int(points[0][0]), int(points[0][1])
        else:
            center_x, center_y = int(positive_points[0][0]), int(positive_points[0][1])
        
        # Generate a mock circular mask around the clicked point
        mock_mask = np.zeros((h, w), dtype=np.uint8)
        radius = min(w, h) // 8  # Smaller radius for point-based selection
        y_grid, x_grid = np.ogrid[:h, :w]
        mask_area = (x_grid - center_x) ** 2 + (y_grid - center_y) ** 2 <= radius ** 2
        mock_mask[mask_area] = 1
        
        rle = self._mask_to_rle(mock_mask)
        area = int(np.sum(mock_mask))
        
        box_x1 = max(0, center_x - radius)
        box_y1 = max(0, center_y - radius)
        box_x2 = min(w, center_x + radius)
        box_y2 = min(h, center_y + radius)
        
        return [{
            "mask_rle": rle,
            "box": [box_x1, box_y1, box_x2, box_y2],
            "score": 0.90,
            "area": area
        }]
    
    def _mask_to_rle(self, mask: np.ndarray) -> Dict:
        """Convert binary mask to RLE format (COCO standard)
        
        Returns counts as alternating run lengths: [bg_run, fg_run, bg_run, fg_run, ...]
        First run is always background (0), even if length is 0.
        """
        pixels = mask.flatten().astype(np.uint8)
        
        # 找到值變化的位置
        diff = np.diff(pixels)
        change_indices = np.where(diff != 0)[0] + 1
        
        # 建立 run lengths
        if len(change_indices) == 0:
            # 全部都是同一個值
            if pixels[0] == 0:
                counts = [len(pixels)]
            else:
                counts = [0, len(pixels)]
        else:
            # 加入起始和結束位置
            positions = np.concatenate([[0], change_indices, [len(pixels)]])
            counts = np.diff(positions).tolist()
            
            # 如果第一個像素是 1，需要在開頭加一個 0
            if pixels[0] == 1:
                counts = [0] + counts
        
        return {
            "counts": counts,
            "size": list(mask.shape)
        }
    
    def reset_prompts(self, image_id: str):
        """Reset all prompts for an image"""
        if self.sam3_available and self.processor and image_id in self.image_states:
            self.processor.reset_all_prompts(self.image_states[image_id])
    
    def get_image_info(self, image_id: str) -> Optional[Dict]:
        """Get image information"""
        if image_id not in self.images:
            return None
        
        image = self.images[image_id]
        return {
            "id": image_id,
            "width": image.width,
            "height": image.height
        }


# Global model instance
sam3_model = SAM3Wrapper()
