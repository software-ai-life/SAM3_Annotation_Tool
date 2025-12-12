import { useRef, useEffect, useState, useCallback } from 'react';
import { useAnnotationStore } from '../store/annotationStore';
import { segmentWithPoints, segmentWithBox, segmentWithTemplate } from '../services/api';
import type { RLEMask } from '../types';

interface AnnotationCanvasProps {
  onSegmentRequest?: () => void;
}

interface ControlPoint {
  x: number;
  y: number;
  index: number;
}

/**
 * RLE 解碼為二進制遮罩
 * 後端使用標準 COCO RLE 格式：counts 是交替的 run 長度 (0s, 1s, 0s, 1s, ...)
 */
function decodeRLE(rle: RLEMask): Uint8Array {
  const [height, width] = rle.size;
  const mask = new Uint8Array(height * width);
  
  let idx = 0;
  let value = 0; // 從 0 開始（第一個 run 是背景）
  
  for (const count of rle.counts) {
    const endIdx = Math.min(idx + count, mask.length);
    for (let i = idx; i < endIdx; i++) {
      mask[i] = value;
    }
    idx = endIdx;
    value = 1 - value; // 交替 0 和 1
  }
  
  return mask;
}

/**
 * 從二進制遮罩提取輪廓點（使用輪廓追蹤算法）
 */
function extractContourPoints(mask: Uint8Array, width: number, height: number): { x: number; y: number }[] {
  const visited = new Set<number>();
  const contour: { x: number; y: number }[] = [];
  
  // 找到第一個邊界點作為起點
  let startX = -1, startY = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 1) {
        // 檢查是否為邊界
        if (x === 0 || mask[idx - 1] === 0) {
          startX = x;
          startY = y;
          break outer;
        }
      }
    }
  }
  
  if (startX === -1) return contour;
  
  // 8 方向鄰居（順時針）
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  
  let x = startX, y = startY;
  let dir = 0; // 起始搜尋方向
  
  do {
    const key = y * width + x;
    if (!visited.has(key)) {
      contour.push({ x, y });
      visited.add(key);
    }
    
    // 從上一個方向的反向+1開始搜尋（確保順時針追蹤）
    let found = false;
    const startDir = (dir + 5) % 8; // 反向 +1
    
    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = x + dx[d];
      const ny = y + dy[d];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (mask[nidx] === 1) {
          // 檢查是否為邊界點
          let isEdge = false;
          for (let j = 0; j < 8; j++) {
            const ex = nx + dx[j];
            const ey = ny + dy[j];
            if (ex < 0 || ex >= width || ey < 0 || ey >= height || mask[ey * width + ex] === 0) {
              isEdge = true;
              break;
            }
          }
          
          if (isEdge) {
            x = nx;
            y = ny;
            dir = d;
            found = true;
            break;
          }
        }
      }
    }
    
    if (!found) break;
    
  } while (x !== startX || y !== startY);
  
  return contour;
}

/**
 * 計算點到線段的垂直距離
 */
function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  if (dx === 0 && dy === 0) {
    // 線段退化為點
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }
  
  const t = Math.max(0, Math.min(1, 
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy)
  ));
  
  const projX = lineStart.x + t * dx;
  const projY = lineStart.y + t * dy;
  
  return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
}

/**
 * Douglas-Peucker 算法簡化輪廓
 * 保留重要的轉折點，去除不重要的點
 */
function douglasPeucker(
  points: { x: number; y: number }[],
  epsilon: number
): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  
  // 找到距離首尾連線最遠的點
  let maxDist = 0;
  let maxIndex = 0;
  
  const first = points[0];
  const last = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }
  
  // 如果最大距離大於閾值，遞歸簡化
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIndex), epsilon);
    
    // 合併結果（去除重複的中間點）
    return [...left.slice(0, -1), ...right];
  } else {
    // 只保留首尾
    return [first, last];
  }
}

/**
 * 簡化輪廓點（使用 Douglas-Peucker 算法）
 */
function simplifyContour(points: { x: number; y: number }[], maxPoints: number = 20): { x: number; y: number }[] {
  if (points.length <= maxPoints) return points;
  
  // 計算適當的 epsilon（基於輪廓的大小）
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  
  const diagonal = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  
  // 動態調整 epsilon 直到達到目標點數
  let epsilon = diagonal * 0.01; // 起始閾值
  let result = douglasPeucker(points, epsilon);
  
  // 如果點數太多，增加 epsilon；如果太少，減少 epsilon
  let iterations = 0;
  while (result.length > maxPoints && iterations < 20) {
    epsilon *= 1.5;
    result = douglasPeucker(points, epsilon);
    iterations++;
  }
  
  // 如果點數太少，減少 epsilon 重新計算
  while (result.length < Math.min(8, maxPoints) && epsilon > 1 && iterations < 30) {
    epsilon *= 0.7;
    result = douglasPeucker(points, epsilon);
    iterations++;
  }
  
  return result;
}

/**
 * 從多邊形點建立遮罩
 */
function polygonToMask(points: { x: number; y: number }[], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  
  if (points.length < 3) return mask;
  
  // 使用掃描線算法填充多邊形
  for (let y = 0; y < height; y++) {
    const intersections: number[] = [];
    
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      
      if ((p1.y <= y && p2.y > y) || (p2.y <= y && p1.y > y)) {
        const x = p1.x + (y - p1.y) / (p2.y - p1.y) * (p2.x - p1.x);
        intersections.push(x);
      }
    }
    
    intersections.sort((a, b) => a - b);
    
    for (let i = 0; i < intersections.length; i += 2) {
      if (i + 1 < intersections.length) {
        const x1 = Math.max(0, Math.floor(intersections[i]));
        const x2 = Math.min(width - 1, Math.ceil(intersections[i + 1]));
        for (let x = x1; x <= x2; x++) {
          mask[y * width + x] = 1;
        }
      }
    }
  }
  
  return mask;
}

/**
 * 將遮罩編碼為 RLE
 */
function maskToRLE(mask: Uint8Array, width: number, height: number): RLEMask {
  const counts: number[] = [];
  let currentValue = 0;
  let runLength = 0;
  
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === currentValue) {
      runLength++;
    } else {
      counts.push(runLength);
      currentValue = 1 - currentValue;
      runLength = 1;
    }
  }
  counts.push(runLength);
  
  // 確保第一個 run 是背景
  if (mask[0] === 1) {
    counts.unshift(0);
  }
  
  return {
    counts,
    size: [height, width]
  };
}

/**
 * 繪製遮罩到 Canvas
 */
function drawMask(
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array,
  width: number,
  height: number,
  color: string,
  alpha: number = 0.4
) {
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;
  
  // 解析顏色
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      const idx = i * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = Math.floor(alpha * 255);
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

export function AnnotationCanvas({ onSegmentRequest: _onSegmentRequest }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const lastImageIdRef = useRef<string | null>(null);
  
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDrawingBox, setIsDrawingBox] = useState(false);
  const [boxStart, setBoxStart] = useState({ x: 0, y: 0 });
  
  // 滑鼠位置（用於貼上預覽）
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null);
  
  // 控制點編輯狀態
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [controlPoints, setControlPoints] = useState<ControlPoint[]>([]);
  const [draggingPointIndex, setDraggingPointIndex] = useState<number | null>(null);
  // 邊界線上的懸停點位置（用於顯示可新增控制點的提示）
  const [hoverEdgePoint, setHoverEdgePoint] = useState<{ x: number; y: number } | null>(null);
  
  const {
    currentImage,
    annotations,
    currentTool,
    selectedAnnotationIds,
    tempPoints,
    tempBox,
    previewMask,
    templateImage,
    templateBox,
    isPasting,
    copiedAnnotations,
    polygonPoints,
    setTempBox,
    addTempPoint,
    clearTempPoints,
    setPreviewMask,
    setTemplateImage,
    setTemplateBox,
    addPolygonPoint,
    clearPolygonPoints,
    updateAnnotation,
    selectAnnotation,
    deselectAll,
    addAnnotation,
    addAnnotations,
    confirmPaste,
    cancelPaste,
    categories,
    currentCategoryId,
    confidenceThreshold,
    setLoading,
    setError
  } = useAnnotationStore();

  // 將螢幕座標轉換為圖片座標
  const screenToImage = useCallback((screenX: number, screenY: number): { x: number; y: number } => {
    if (!containerRef.current || !currentImage) return { x: 0, y: 0 };
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (screenX - rect.left - offset.x) / scale;
    const y = (screenY - rect.top - offset.y) / scale;
    
    return {
      x: Math.max(0, Math.min(x, currentImage.width)),
      y: Math.max(0, Math.min(y, currentImage.height))
    };
  }, [scale, offset, currentImage]);

  // 繪製主畫布（圖片）
  const drawMainCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !currentImage) {
      console.log('[drawMainCanvas] 缺少必要元素:', { canvas: !!canvas, ctx: !!ctx, currentImage: !!currentImage });
      return;
    }

    console.log('[drawMainCanvas] currentImage:', {
      id: currentImage.id,
      fileName: currentImage.fileName,
      width: currentImage.width,
      height: currentImage.height,
      urlType: typeof currentImage.url,
      urlLength: currentImage.url?.length || 0,
      urlStart: currentImage.url?.substring(0, 60) || '(empty)',
      hasFile: !!currentImage.file
    });

    // 如果同一張圖片已載入完成，直接繪製快取版本
    if (
      imageRef.current &&
      lastImageIdRef.current === currentImage.id &&
      imageRef.current.complete &&
      imageRef.current.naturalWidth > 0
    ) {
      console.log('[drawMainCanvas] 使用快取圖片');
      canvas.width = currentImage.width;
      canvas.height = currentImage.height;
      ctx.drawImage(imageRef.current, 0, 0);
      return;
    }

    // 輔助函式：使用 createImageBitmap 從 File 載入圖片（支援 BMP 等格式）
    const loadImageFromFile = async (file: File): Promise<void> => {
      try {
        console.log('[loadImageFromFile] 使用 createImageBitmap 載入:', file.name);
        const imageBitmap = await createImageBitmap(file);
        console.log('[loadImageFromFile] 成功:', imageBitmap.width, 'x', imageBitmap.height);
        
        canvas.width = imageBitmap.width;
        canvas.height = imageBitmap.height;
        ctx.drawImage(imageBitmap, 0, 0);
        
        // 同時更新 imageRef 用於後續繪製
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageBitmap.width;
        tempCanvas.height = imageBitmap.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.drawImage(imageBitmap, 0, 0);
          const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.92);
          const img = new Image();
          img.onload = () => {
            imageRef.current = img;
            lastImageIdRef.current = currentImage.id;
          };
          img.src = dataUrl;
        }
        
        imageBitmap.close();
      } catch (err) {
        console.error('[loadImageFromFile] createImageBitmap 失敗:', err);
        throw err;
      }
    };

    // 輔助函式：載入圖片到 canvas (用於 data URL 或一般 URL)
    const loadImage = (src: string, isRetry = false) => {
      console.log('[loadImage] 載入圖片, src 長度:', src.length, '開頭:', src.substring(0, 60));
      const img = new Image();
      // 僅對遠端 URL 設置 crossOrigin
      if (/^https?:\/\//i.test(src)) {
        img.crossOrigin = 'anonymous';
      }
      
      img.onload = () => {
        console.log('[loadImage] 圖片載入成功:', img.naturalWidth, 'x', img.naturalHeight);
        imageRef.current = img;
        lastImageIdRef.current = currentImage.id;
        canvas.width = img.naturalWidth || currentImage.width;
        canvas.height = img.naturalHeight || currentImage.height;
        ctx.drawImage(img, 0, 0);
      };
      
      img.onerror = async () => {
        console.error('[loadImage] img.onerror 觸發, isRetry:', isRetry, 'hasFile:', !!currentImage.file);
        // 首次失敗且有 file，嘗試使用 createImageBitmap
        if (!isRetry && currentImage.file) {
          console.warn('[loadImage] 嘗試使用 createImageBitmap 從 File 載入...');
          try {
            await loadImageFromFile(currentImage.file);
            return;
          } catch (err) {
            console.error('[loadImage] createImageBitmap 也失敗:', err);
          }
        }
        
        // 最終失敗，顯示錯誤佔位
        console.error('[loadImage] 最終失敗, src:', src.substring(0, 100));
        canvas.width = currentImage.width || 800;
        canvas.height = currentImage.height || 600;
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('圖片載入失敗', canvas.width / 2, canvas.height / 2);
      };
      
      img.src = src;
    };

    // 取得圖片來源
    let imgSrc = currentImage.url;
    
    // 若 URL 無效，嘗試從 file 建立
    if (!imgSrc || imgSrc === '') {
      if (currentImage.file) {
        loadImageFromFile(currentImage.file).catch(() => {
          canvas.width = currentImage.width || 800;
          canvas.height = currentImage.height || 600;
          ctx.fillStyle = '#374151';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#9ca3af';
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('無法讀取檔案', canvas.width / 2, canvas.height / 2);
        });
        return;
      } else {
        canvas.width = currentImage.width || 800;
        canvas.height = currentImage.height || 600;
        ctx.fillStyle = '#374151';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('無圖片來源', canvas.width / 2, canvas.height / 2);
        return;
      }
    }

    loadImage(imgSrc);
  }, [currentImage]);

  // 繪製覆蓋層（標註、臨時繪圖等）
  const drawOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !currentImage) return;

    canvas.width = currentImage.width;
    canvas.height = currentImage.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 只顯示當前圖片的標註
    const currentAnnotations = annotations.filter(ann => ann.imageId === currentImage.id);

    // 繪製標註遮罩
    currentAnnotations.forEach((ann) => {
      if (!ann.visible) return;
      
      try {
        const mask = decodeRLE(ann.segmentation);
        const [height, width] = ann.segmentation.size;
        
        // 建立臨時 canvas 繪製遮罩
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          drawMask(tempCtx, mask, width, height, ann.color, ann.selected ? 0.6 : 0.4);
          ctx.drawImage(tempCanvas, 0, 0);
        }
        
        // 選中時繪製控制點
        if (ann.selected && editingAnnotationId === ann.id && controlPoints.length > 0) {
          // 繪製多邊形輪廓（使用對比色）
          ctx.beginPath();
          ctx.moveTo(controlPoints[0].x, controlPoints[0].y);
          for (let i = 1; i < controlPoints.length; i++) {
            ctx.lineTo(controlPoints[i].x, controlPoints[i].y);
          }
          ctx.closePath();
          // 使用白色外框 + 黑色內框增加可見度
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.stroke();
          
          // 繪製控制點（固定視覺大小，不隨縮放變化）
          controlPoints.forEach((point, idx) => {
            const isActive = draggingPointIndex === idx;
            // 除以 scale 讓點在視覺上保持固定大小（縮小尺寸）
            const pointRadius = (isActive ? 5 : 4) / scale;
            const shadowRadius = pointRadius + 1 / scale;
            const centerRadius = 1.5 / scale;
            const borderWidth = 1 / scale;
            
            // 外圈（黑色陰影效果）
            ctx.beginPath();
            ctx.arc(point.x, point.y, shadowRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fill();
            
            // 主圓點（亮色填充）
            ctx.beginPath();
            ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
            ctx.fillStyle = isActive ? '#fbbf24' : '#ffffff';  // 黃色表示正在拖曳
            ctx.fill();
            
            // 內圈邊框（深色）
            ctx.strokeStyle = '#1f2937';
            ctx.lineWidth = borderWidth;
            ctx.stroke();
            
            // 中心小點（標示位置）
            ctx.beginPath();
            ctx.arc(point.x, point.y, centerRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#1f2937';
            ctx.fill();
          });
          
          // 繪製邊界線上的懸停提示（可雙擊新增控制點）
          if (hoverEdgePoint) {
            const hoverRadius = 4 / scale;
            const hoverShadowRadius = hoverRadius + 1 / scale;
            
            // 外圈（陰影效果）
            ctx.beginPath();
            ctx.arc(hoverEdgePoint.x, hoverEdgePoint.y, hoverShadowRadius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fill();
            
            // 主圓點（綠色表示可新增）
            ctx.beginPath();
            ctx.arc(hoverEdgePoint.x, hoverEdgePoint.y, hoverRadius, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';  // 綠色
            ctx.fill();
            
            // 邊框
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1 / scale;
            ctx.stroke();
            
            // + 符號
            const plusSize = 2 / scale;
            ctx.beginPath();
            ctx.moveTo(hoverEdgePoint.x - plusSize, hoverEdgePoint.y);
            ctx.lineTo(hoverEdgePoint.x + plusSize, hoverEdgePoint.y);
            ctx.moveTo(hoverEdgePoint.x, hoverEdgePoint.y - plusSize);
            ctx.lineTo(hoverEdgePoint.x, hoverEdgePoint.y + plusSize);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1 / scale;
            ctx.stroke();
          }
        } else if (ann.selected) {
          // 顯示邊界框和編輯提示
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          const [x, y, w, h] = ann.bbox;
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        }
      } catch (e) {
        console.warn('Failed to draw annotation:', e);
      }
    });

    // 繪製預覽遮罩（點分割時的即時預覽，藍色半透明）
    if (previewMask) {
      try {
        const mask = decodeRLE(previewMask.mask_rle);
        const [height, width] = previewMask.mask_rle.size;
        
        // 建立臨時 canvas 繪製預覽遮罩
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          // 使用藍色顯示預覽遮罩
          drawMask(tempCtx, mask, width, height, '#3b82f6', 0.5);
          ctx.drawImage(tempCanvas, 0, 0);
        }
        
        // 繪製預覽遮罩的邊界框
        const [x1, y1, x2, y2] = previewMask.box;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.setLineDash([]);
        
        // 顯示分數
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`Score: ${(previewMask.score * 100).toFixed(1)}%`, x1, y1 - 20);
      } catch (e) {
        console.warn('Failed to draw preview mask:', e);
      }
    }

    // 繪製臨時點
    tempPoints.forEach(point => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = point.label === 1 ? '#22c55e' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 繪製正負號
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(point.label === 1 ? '+' : '-', point.x, point.y);
    });

    // 繪製臨時框選
    if (tempBox) {
      // 模板工具使用紫色，框選工具使用藍色
      const isTemplate = currentTool === 'template';
      const fillColor = isTemplate ? 'rgba(168, 85, 247, 0.15)' : 'rgba(59, 130, 246, 0.15)';
      const strokeColor = isTemplate ? '#9333ea' : '#2563eb';
      const cornerColor = isTemplate ? '#7c3aed' : '#1d4ed8';
      
      // 繪製半透明填充
      ctx.fillStyle = fillColor;
      ctx.fillRect(
        tempBox.x1,
        tempBox.y1,
        tempBox.x2 - tempBox.x1,
        tempBox.y2 - tempBox.y1
      );
      
      // 繪製明顯的邊框
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(
        tempBox.x1,
        tempBox.y1,
        tempBox.x2 - tempBox.x1,
        tempBox.y2 - tempBox.y1
      );
      ctx.setLineDash([]);
      
      // 繪製四個角的標記
      const cornerSize = 12;
      ctx.strokeStyle = cornerColor;
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      
      // 左上角
      ctx.beginPath();
      ctx.moveTo(tempBox.x1, tempBox.y1 + cornerSize);
      ctx.lineTo(tempBox.x1, tempBox.y1);
      ctx.lineTo(tempBox.x1 + cornerSize, tempBox.y1);
      ctx.stroke();
      
      // 右上角
      ctx.beginPath();
      ctx.moveTo(tempBox.x2 - cornerSize, tempBox.y1);
      ctx.lineTo(tempBox.x2, tempBox.y1);
      ctx.lineTo(tempBox.x2, tempBox.y1 + cornerSize);
      ctx.stroke();
      
      // 左下角
      ctx.beginPath();
      ctx.moveTo(tempBox.x1, tempBox.y2 - cornerSize);
      ctx.lineTo(tempBox.x1, tempBox.y2);
      ctx.lineTo(tempBox.x1 + cornerSize, tempBox.y2);
      ctx.stroke();
      
      // 右下角
      ctx.beginPath();
      ctx.moveTo(tempBox.x2 - cornerSize, tempBox.y2);
      ctx.lineTo(tempBox.x2, tempBox.y2);
      ctx.lineTo(tempBox.x2, tempBox.y2 - cornerSize);
      ctx.stroke();
      
      // 模板工具顯示提示文字
      if (isTemplate) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.9)';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('選取模板區域', (tempBox.x1 + tempBox.x2) / 2, tempBox.y1 - 10);
      }
    }
    
    // 如果有已儲存的模板且當前是模板工具，顯示模板指示
    if (currentTool === 'template' && templateImage && templateBox && currentImage) {
      // 如果模板來自當前圖片，在畫布上顯示模板區域
      if (templateImage.id === currentImage.id) {
        ctx.strokeStyle = '#10b981';  // 綠色
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
          templateBox.x1,
          templateBox.y1,
          templateBox.x2 - templateBox.x1,
          templateBox.y2 - templateBox.y1
        );
        ctx.setLineDash([]);
        
        // 顯示「已選模板」標籤
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('✓ 已選模板', (templateBox.x1 + templateBox.x2) / 2, templateBox.y1 - 8);
      }
    }
    
    // 繪製貼上預覽（跟隨滑鼠的 mask 預覽）
    if (isPasting && copiedAnnotations.length > 0 && mousePosition) {
      // 從 mask 實際像素計算中心點（更準確）
      let totalPixelX = 0;
      let totalPixelY = 0;
      let totalPixels = 0;
      
      copiedAnnotations.forEach(ann => {
        const mask = decodeRLE(ann.segmentation);
        const [maskHeight, maskWidth] = ann.segmentation.size;
        
        // 計算 mask 中所有像素的中心（使用 row-major 索引）
        for (let y = 0; y < maskHeight; y++) {
          for (let x = 0; x < maskWidth; x++) {
            const idx = y * maskWidth + x;
            if (mask[idx] === 1) {
              totalPixelX += x;
              totalPixelY += y;
              totalPixels++;
            }
          }
        }
      });
      
      // 計算 mask 的質心
      const origCenterX = totalPixels > 0 ? totalPixelX / totalPixels : 0;
      const origCenterY = totalPixels > 0 ? totalPixelY / totalPixels : 0;
      
      // 計算偏移量：讓質心移動到滑鼠位置
      const offsetX = mousePosition.x - origCenterX;
      const offsetY = mousePosition.y - origCenterY;
      
      // 繪製每個複製的標註的預覽
      copiedAnnotations.forEach((ann) => {
        try {
          const mask = decodeRLE(ann.segmentation);
          const [height, width] = ann.segmentation.size;
          
          // 建立臨時 canvas 繪製遮罩
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = width;
          tempCanvas.height = height;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            // 使用半透明橙色顯示貼上預覽
            drawMask(tempCtx, mask, width, height, '#f97316', 0.5);
          }
          
          // 在偏移後的位置繪製整個 mask canvas
          ctx.drawImage(tempCanvas, offsetX, offsetY);
          
          // 繪製預覽邊界框（也偏移）
          const [x, y, w, h] = ann.bbox;
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(x + offsetX, y + offsetY, w, h);
          ctx.setLineDash([]);
        } catch (e) {
          console.warn('Failed to draw paste preview:', e);
        }
      });
      
      // 顯示貼上提示
      ctx.fillStyle = 'rgba(249, 115, 22, 0.9)';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('點擊放置 / 右鍵取消', mousePosition.x, mousePosition.y - 15);
      
      // 繪製十字準星
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(mousePosition.x - 10, mousePosition.y);
      ctx.lineTo(mousePosition.x + 10, mousePosition.y);
      ctx.moveTo(mousePosition.x, mousePosition.y - 10);
      ctx.lineTo(mousePosition.x, mousePosition.y + 10);
      ctx.stroke();
    }
    
    // 繪製手動多邊形（polygon 工具）
    if (currentTool === 'polygon' && polygonPoints.length > 0) {
      // 繪製已有頂點間的連線
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
      for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
      }
      
      // 如果滑鼠位置存在，畫到滑鼠位置（動態預覽）
      if (mousePosition) {
        ctx.lineTo(mousePosition.x, mousePosition.y);
        // 如果點數 >= 3，也畫回起點的虛線（閉合預覽）
        if (polygonPoints.length >= 2) {
          ctx.setLineDash([4, 4]);
          ctx.lineTo(polygonPoints[0].x, polygonPoints[0].y);
          ctx.setLineDash([]);
        }
      }
      
      // 繪製邊線（雙層提高可見度）
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#10b981';  // 綠色
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // 繪製頂點
      polygonPoints.forEach((point, idx) => {
        const isFirst = idx === 0;
        const pointRadius = isFirst ? 10 : 7;  // 起點較大
        
        // 外圈陰影
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius + 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fill();
        
        // 主圓點
        ctx.beginPath();
        ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
        ctx.fillStyle = isFirst ? '#fbbf24' : '#ffffff';  // 起點用黃色
        ctx.fill();
        
        // 邊框
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // 起點標記 (顯示可閉合提示)
        if (isFirst && polygonPoints.length >= 3) {
          ctx.fillStyle = '#10b981';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText('閉合', point.x, point.y - 14);
        }
      });
      
      // 顯示操作提示
      if (polygonPoints.length > 0) {
        const lastPoint = polygonPoints[polygonPoints.length - 1];
        ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        const hintText = polygonPoints.length >= 3 
          ? '左鍵繼續 / Enter 或點擊起點閉合 / Esc 取消'
          : `已加 ${polygonPoints.length} 點，至少需要 3 點`;
        ctx.fillText(hintText, lastPoint.x + 15, lastPoint.y);
      }
    }
  }, [currentImage, annotations, tempPoints, tempBox, previewMask, controlPoints, editingAnnotationId, draggingPointIndex, currentTool, templateImage, templateBox, isPasting, copiedAnnotations, mousePosition, polygonPoints, scale, hoverEdgePoint]);

  // 當選中標註時，載入控制點
  useEffect(() => {
    if (selectedAnnotationIds.length === 1) {
      const selectedAnn = annotations.find(ann => ann.id === selectedAnnotationIds[0]);
      if (selectedAnn && selectedAnn.id !== editingAnnotationId) {
        // 從遮罩提取輪廓點
        const mask = decodeRLE(selectedAnn.segmentation);
        const [height, width] = selectedAnn.segmentation.size;
        const contour = extractContourPoints(mask, width, height);
        const simplified = simplifyContour(contour, 16);
        
        setControlPoints(simplified.map((p, i) => ({ ...p, index: i })));
        setEditingAnnotationId(selectedAnn.id);
      }
    } else {
      setControlPoints([]);
      setEditingAnnotationId(null);
    }
  }, [selectedAnnotationIds, annotations, editingAnnotationId]);

  // 檢查是否點擊到控制點
  const findControlPointAtPosition = useCallback((x: number, y: number): number | null => {
    const hitRadius = 10 / scale; // 點擊半徑，考慮縮放
    for (let i = 0; i < controlPoints.length; i++) {
      const dx = controlPoints[i].x - x;
      const dy = controlPoints[i].y - y;
      if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
        return i;
      }
    }
    return null;
  }, [controlPoints, scale]);

  // 計算點到線段的距離，並返回最近點的位置
  const pointToSegmentDistance = useCallback((
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): { distance: number; point: { x: number; y: number } } => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    
    if (lengthSquared === 0) {
      // 線段長度為 0，返回起點
      return {
        distance: Math.sqrt((px - x1) ** 2 + (py - y1) ** 2),
        point: { x: x1, y: y1 }
      };
    }
    
    // 計算投影點的參數 t（限制在 0~1 之間）
    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    
    // 計算最近點
    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;
    
    return {
      distance: Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2),
      point: { x: nearestX, y: nearestY }
    };
  }, []);

  // 在控制點邊界線上找到最近的線段，返回插入位置和座標
  const findNearestEdgePosition = useCallback((x: number, y: number): { 
    insertIndex: number; 
    point: { x: number; y: number };
    distance: number;
  } | null => {
    if (controlPoints.length < 2) return null;
    
    let minDistance = Infinity;
    let insertIndex = -1;
    let nearestPoint = { x: 0, y: 0 };
    
    // 檢查所有邊（包括最後一點到第一點的閉合邊）
    for (let i = 0; i < controlPoints.length; i++) {
      const p1 = controlPoints[i];
      const p2 = controlPoints[(i + 1) % controlPoints.length];
      
      const result = pointToSegmentDistance(x, y, p1.x, p1.y, p2.x, p2.y);
      
      if (result.distance < minDistance) {
        minDistance = result.distance;
        insertIndex = i + 1; // 插入到 p1 和 p2 之間
        nearestPoint = result.point;
      }
    }
    
    if (insertIndex === -1) return null;
    
    return {
      insertIndex: insertIndex === controlPoints.length ? controlPoints.length : insertIndex,
      point: nearestPoint,
      distance: minDistance
    };
  }, [controlPoints, pointToSegmentDistance]);

  // 在邊界線上新增控制點
  const addControlPointOnEdge = useCallback((x: number, y: number): boolean => {
    if (!editingAnnotationId || controlPoints.length < 3) return false;
    
    const edgeHitRadius = 15 / scale; // 邊緣點擊判定半徑
    const result = findNearestEdgePosition(x, y);
    
    if (!result || result.distance > edgeHitRadius) return false;
    
    // 建立新的控制點陣列，在指定位置插入新點
    const newPoints: ControlPoint[] = [
      ...controlPoints.slice(0, result.insertIndex),
      { x: result.point.x, y: result.point.y, index: result.insertIndex },
      ...controlPoints.slice(result.insertIndex)
    ];
    
    // 重新編號 index
    const reindexedPoints = newPoints.map((p, i) => ({ ...p, index: i }));
    setControlPoints(reindexedPoints);
    
    return true;
  }, [editingAnnotationId, controlPoints, scale, findNearestEdgePosition]);

  // 檢查點擊位置是否在某個標註的遮罩內
  const findAnnotationAtPosition = useCallback((x: number, y: number): string | null => {
    if (!currentImage) return null;
    
    const currentAnnotations = annotations.filter(ann => ann.imageId === currentImage.id && ann.visible);
    
    // 從後往前檢查（後繪製的在上層）
    for (let i = currentAnnotations.length - 1; i >= 0; i--) {
      const ann = currentAnnotations[i];
      const [height, width] = ann.segmentation.size;
      
      // 檢查是否在 bbox 內（快速篩選）
      const [bx, by, bw, bh] = ann.bbox;
      if (x < bx || x > bx + bw || y < by || y > by + bh) {
        continue;
      }
      
      // 解碼遮罩並檢查該像素
      const mask = decodeRLE(ann.segmentation);
      const px = Math.floor(x);
      const py = Math.floor(y);
      
      if (px >= 0 && px < width && py >= 0 && py < height) {
        const idx = py * width + px;
        if (mask[idx] === 1) {
          return ann.id;
        }
      }
    }
    
    return null;
  }, [currentImage, annotations]);

  // 新增臨時點並更新預覽遮罩（不建立標註）
  const addPointAndUpdatePreview = useCallback(async (x: number, y: number, label: 0 | 1) => {
    console.log('[addPointAndUpdatePreview] 新增點, x:', x, 'y:', y, 'label:', label, '(', label === 1 ? 'positive' : 'negative', ')');
    
    if (!currentImage || currentImage.isLocalOnly) {
      if (currentImage?.isLocalOnly) {
        setError('本地圖片無法進行 SAM3 分割，請確保後端連接正常');
      }
      return;
    }

    if (!currentCategoryId) {
      setError('請先選擇或新增一個類別');
      return;
    }

    // 新增當前點到累積列表
    const newPoint = { x, y, label };
    const allPoints = [...tempPoints, newPoint];
    
    // 判斷這是否為第一個點（需要重置 mask 狀態）
    const isFirstPoint = tempPoints.length === 0;
    
    // 先加入點到 UI 顯示
    addTempPoint(newPoint);
    
    // 檢查是否有 positive 點
    const hasPositive = allPoints.some(p => p.label === 1);
    if (!hasPositive) {
      // 如果只有 negative 點，只累積不呼叫 API（需要先有 positive 點才能分割）
      setError('請先用左鍵點擊要分割的物體');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[addPointAndUpdatePreview] 呼叫 API 更新預覽:', {
        imageId: currentImage.id,
        points: allPoints,
        positiveCount: allPoints.filter(p => p.label === 1).length,
        negativeCount: allPoints.filter(p => p.label === 0).length,
        isFirstPoint,
        resetMask: isFirstPoint
      });

      // 第一個點時 resetMask=true 開始新標註，後續點 resetMask=false 進行 refinement
      const results = await segmentWithPoints(
        currentImage.id,
        allPoints,
        confidenceThreshold,
        isFirstPoint  // resetMask: 第一個點時重置 mask 狀態
      );

      console.log('[addPointAndUpdatePreview] 結果:', results.length, '個分割');

      if (results.length > 0) {
        // 取最高分的結果作為預覽
        const best = results.reduce((a, b) => a.score > b.score ? a : b);
        setPreviewMask({
          mask_rle: best.mask_rle,
          box: best.box,
          score: best.score,
          area: best.area
        });
      } else {
        console.warn('[addPointAndUpdatePreview] 無分割結果');
        setPreviewMask(null);
      }
    } catch (err) {
      console.error('[addPointAndUpdatePreview] 錯誤:', err);
      setError(err instanceof Error ? err.message : '分割失敗');
    } finally {
      setLoading(false);
    }
  }, [currentImage, currentCategoryId, tempPoints, confidenceThreshold, setLoading, setError, addTempPoint, setPreviewMask]);

  // 框選完成後更新預覽遮罩
  const updateBoxPreview = useCallback(async (box: { x1: number; y1: number; x2: number; y2: number }) => {
    console.log('[updateBoxPreview] 框選完成, box:', box);
    
    if (!currentImage || currentImage.isLocalOnly) {
      if (currentImage?.isLocalOnly) {
        setError('本地圖片無法進行 SAM3 分割，請確保後端連接正常');
      }
      return;
    }

    if (!currentCategoryId) {
      setError('請先選擇或新增一個類別');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await segmentWithBox(
        currentImage.id,
        box,
        true,  // positive label
        confidenceThreshold
      );

      console.log('[updateBoxPreview] 結果:', results.length, '個分割');

      if (results.length > 0) {
        // 取最高分的結果作為預覽
        const best = results.reduce((a, b) => a.score > b.score ? a : b);
        setPreviewMask({
          mask_rle: best.mask_rle,
          box: best.box,
          score: best.score,
          area: best.area
        });
        // 清除框選，保留預覽 mask
        setTempBox(null);
      } else {
        console.warn('[updateBoxPreview] 無分割結果');
        setPreviewMask(null);
        setTempBox(null);
      }
    } catch (err) {
      console.error('[updateBoxPreview] 錯誤:', err);
      setError(err instanceof Error ? err.message : '分割失敗');
      setTempBox(null);
    } finally {
      setLoading(false);
    }
  }, [currentImage, currentCategoryId, confidenceThreshold, setLoading, setError, setPreviewMask, setTempBox]);

  // 儲存模板：將當前框選區域儲存為模板
  const saveTemplate = useCallback((box: { x1: number; y1: number; x2: number; y2: number }) => {
    console.log('[saveTemplate] 儲存模板:', box);
    
    if (!currentImage) {
      setError('請先選擇圖片');
      return;
    }

    // 儲存模板圖片和框選區域
    setTemplateImage(currentImage);
    setTemplateBox(box);
    setTempBox(null);
    
    console.log('[saveTemplate] 模板已儲存, imageId:', currentImage.id);
  }, [currentImage, setTemplateImage, setTemplateBox, setTempBox, setError]);

  // 套用模板：在當前圖片上搜尋與模板相似的物體（批次偵測）
  const applyTemplate = useCallback(async () => {
    console.log('[applyTemplate] 套用模板');
    
    if (!currentImage || currentImage.isLocalOnly) {
      setError('請先選擇已上傳的圖片');
      return;
    }

    if (!templateImage || !templateBox) {
      setError('請先選擇模板（在圖片上框選物體作為範例）');
      return;
    }

    if (!currentCategoryId) {
      setError('請先選擇或新增一個類別');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log('[applyTemplate] 呼叫 API:', {
        imageId: currentImage.id,
        templateImageId: templateImage.id,
        templateBox
      });

      const results = await segmentWithTemplate(
        currentImage.id,
        templateImage.id,
        templateBox,
        confidenceThreshold
      );

      console.log('[applyTemplate] 結果:', results.length, '個分割');

      if (results.length > 0) {
        // 獲取當前類別資訊
        const category = categories.find(c => c.id === currentCategoryId);
        const categoryName = category?.name || 'object';

        // 將所有結果轉換為標註並批次添加
        const annotationsToAdd = results.map(result => ({
          imageId: currentImage.id,
          categoryId: currentCategoryId,
          categoryName,
          segmentation: result.mask_rle,
          bbox: result.box as [number, number, number, number],
          score: result.score,
          area: result.area
        }));

        addAnnotations(annotationsToAdd);
        
        // 清除預覽
        setPreviewMask(null);
        
        console.log(`[applyTemplate] 已添加 ${results.length} 個標註`);
      } else {
        setError('未找到相似物體');
        setPreviewMask(null);
      }
    } catch (err) {
      console.error('[applyTemplate] 錯誤:', err);
      setError(err instanceof Error ? err.message : '模板比對失敗');
    } finally {
      setLoading(false);
    }
  }, [currentImage, templateImage, templateBox, currentCategoryId, categories, confidenceThreshold, setLoading, setError, setPreviewMask, addAnnotations]);

  // 清除模板
  const clearTemplate = useCallback(() => {
    setTemplateImage(null);
    setTemplateBox(null);
    console.log('[clearTemplate] 模板已清除');
  }, [setTemplateImage, setTemplateBox]);

  // 確認分割：將預覽遮罩建立為正式標註
  const confirmSegmentation = useCallback(() => {
    console.log('[confirmSegmentation] 確認分割');
    
    if (!currentImage || !previewMask) {
      setError('沒有可確認的分割結果');
      return;
    }

    if (!currentCategoryId) {
      setError('請先選擇或新增一個類別');
      return;
    }

    const category = categories.find(c => c.id === currentCategoryId);
    if (!category) {
      setError('找不到選中的類別');
      return;
    }

    // 建立標註
    addAnnotation({
      imageId: currentImage.id,
      categoryId: category.id,
      categoryName: category.name,
      segmentation: previewMask.mask_rle,
      bbox: previewMask.box,
      area: previewMask.area,
      score: previewMask.score
    });

    // 清除臨時狀態
    clearTempPoints();
    setError(null);
    
    console.log('[confirmSegmentation] 標註建立成功');
  }, [currentImage, previewMask, currentCategoryId, categories, addAnnotation, clearTempPoints, setError]);

  // 確認多邊形：將手動繪製的多邊形轉換為標註
  const confirmPolygon = useCallback(() => {
    console.log('[confirmPolygon] 確認多邊形, 頂點數:', polygonPoints.length);
    
    if (!currentImage) {
      setError('請先選擇圖片');
      return;
    }

    if (polygonPoints.length < 3) {
      setError('多邊形至少需要 3 個頂點');
      return;
    }

    if (!currentCategoryId) {
      setError('請先選擇或新增一個類別');
      return;
    }

    const category = categories.find(c => c.id === currentCategoryId);
    if (!category) {
      setError('找不到選中的類別');
      return;
    }

    // 將多邊形轉換為遮罩
    const width = currentImage.width;
    const height = currentImage.height;
    const mask = polygonToMask(polygonPoints, width, height);
    const rle = maskToRLE(mask, width, height);
    
    // 計算面積
    const area = mask.reduce((sum, val) => sum + val, 0);
    
    // 計算 bbox
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (const p of polygonPoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const bbox: [number, number, number, number] = [minX, minY, maxX - minX, maxY - minY];

    // 建立標註
    addAnnotation({
      imageId: currentImage.id,
      categoryId: category.id,
      categoryName: category.name,
      segmentation: rle,
      bbox,
      area,
      score: 1.0  // 手動標註分數為 1.0
    });

    // 清除多邊形頂點
    clearPolygonPoints();
    setError(null);
    
    console.log('[confirmPolygon] 多邊形標註建立成功');
  }, [currentImage, polygonPoints, currentCategoryId, categories, addAnnotation, clearPolygonPoints, setError]);

  // 處理滑鼠點擊
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!currentImage) return;
    
    // 滑鼠中鍵（滾輪按下）：在任何工具模式下都可以拖曳平移畫布
    if (e.button === 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }
    
    const { x, y } = screenToImage(e.clientX, e.clientY);
    
    // 如果在貼上模式，點擊確認貼上位置
    if (isPasting) {
      if (e.button === 0) {  // 左鍵確認
        confirmPaste(x, y);
      } else if (e.button === 2) {  // 右鍵取消
        cancelPaste();
      }
      return;
    }
    
    // 多邊形工具：最優先處理，避免不必要的運算
    if (currentTool === 'polygon') {
      if (e.button === 0) {
        // 檢查是否點擊到起點（閉合多邊形）
        if (polygonPoints.length >= 3) {
          const firstPoint = polygonPoints[0];
          const dist = Math.sqrt((x - firstPoint.x) ** 2 + (y - firstPoint.y) ** 2);
          const closeThreshold = 15 / scale;  // 根據縮放調整閉合閾值
          if (dist < closeThreshold) {
            // 點擊起點，閉合並建立標註
            confirmPolygon();
            return;
          }
        }
        // 新增頂點（直接執行，不需要等待）
        addPolygonPoint({ x, y });
      }
      return;
    }
    
    // 先檢查是否點擊到控制點（拖曳現有控制點）
    if (controlPoints.length > 0) {
      const pointIndex = findControlPointAtPosition(x, y);
      if (pointIndex !== null) {
        setDraggingPointIndex(pointIndex);
        return;
      }
      
      // 如果沒有點擊到控制點，檢查是否點擊到邊界線上（新增控制點）
      // 雙擊邊界線新增控制點
      if (e.detail === 2 && addControlPointOnEdge(x, y)) {
        return;
      }
    }
    
    if (currentTool === 'pointer') {
      // 檢查是否點擊到遮罩
      const clickedAnnotationId = findAnnotationAtPosition(x, y);
      if (clickedAnnotationId) {
        // 支援 Ctrl/Cmd/Shift 多選
        selectAnnotation(clickedAnnotationId, e.ctrlKey || e.metaKey || e.shiftKey);
        return;
      } else {
        // 點擊空白處取消選取
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          deselectAll();
        }
      }
      
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    } else if (currentTool === 'add-point' || currentTool === 'remove-point') {
      // 點分割工具：左鍵 = positive (1)，更新預覽
      // 右鍵由 handleContextMenu 處理
      if (e.button === 0) {
        addPointAndUpdatePreview(x, y, 1);  // 1 = positive
      }
    } else if (currentTool === 'box' || currentTool === 'template') {
      // 框選工具和模板工具都使用框選
      setIsDrawingBox(true);
      setBoxStart({ x, y });
      setTempBox({ x1: x, y1: y, x2: x, y2: y });
    }
  }, [currentImage, currentTool, screenToImage, offset, setTempBox, controlPoints, findControlPointAtPosition, findAnnotationAtPosition, selectAnnotation, deselectAll, addPointAndUpdatePreview, isPasting, confirmPaste, cancelPaste, polygonPoints, scale, addPolygonPoint, confirmPolygon, addControlPointOnEdge]);

  // 處理右鍵選單（禁止預設行為並處理負向點）
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // 阻止預設右鍵選單
    e.preventDefault();
    
    console.log('[handleContextMenu] 右鍵點擊, currentTool:', currentTool);
    
    // 如果是點分割工具，右鍵 = negative point，更新預覽
    if ((currentTool === 'add-point' || currentTool === 'remove-point') && currentImage) {
      const { x, y } = screenToImage(e.clientX, e.clientY);
      console.log('[handleContextMenu] 新增 negative 點, x:', x, 'y:', y);
      addPointAndUpdatePreview(x, y, 0);  // 0 = negative
    }
  }, [currentTool, currentImage, screenToImage, addPointAndUpdatePreview]);

  // 鍵盤事件處理（Enter 確認分割/套用模板/確認多邊形，Escape 取消）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 點分割工具、框選工具、模板工具、多邊形工具都可以確認/取消
      const isPointTool = currentTool === 'add-point' || currentTool === 'remove-point';
      const isBoxTool = currentTool === 'box';
      const isTemplateTool = currentTool === 'template';
      const isPolygonTool = currentTool === 'polygon';
      
      if (!isPointTool && !isBoxTool && !isTemplateTool && !isPolygonTool) return;
      
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isPolygonTool && polygonPoints.length >= 3) {
          // 多邊形工具：確認多邊形
          console.log('[handleKeyDown] Enter 按下, 確認多邊形');
          confirmPolygon();
        } else if (isTemplateTool && templateImage && templateBox && !previewMask) {
          // 模板工具且已有模板但無預覽：檢查是否同圖
          if (currentImage && currentImage.id === templateImage.id) {
            console.log('[handleKeyDown] Enter 按下, 套用模板（同圖）');
            applyTemplate();
          } else {
            console.log('[handleKeyDown] 跨圖模板不支援');
            setError('模板功能僅支援同圖檢測。跨圖請使用「文字工具」。');
          }
        } else if (previewMask) {
          // 有預覽遮罩：確認分割
          console.log('[handleKeyDown] Enter 按下, 確認分割');
          confirmSegmentation();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        console.log('[handleKeyDown] Escape 按下, 清除臨時狀態');
        if (isPolygonTool) {
          clearPolygonPoints();
        } else {
          clearTempPoints();
          setPreviewMask(null);
          if (isTemplateTool) {
            clearTemplate();
          }
        }
        setError(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentTool, confirmSegmentation, confirmPolygon, clearTempPoints, clearPolygonPoints, setPreviewMask, setError, templateImage, templateBox, previewMask, applyTemplate, clearTemplate, polygonPoints, currentImage]);

  // 處理滑鼠移動
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!currentImage) return;
    
    const { x, y } = screenToImage(e.clientX, e.clientY);
    
    // 如果在貼上模式，更新滑鼠位置
    if (isPasting) {
      setMousePosition({ x, y });
      return;
    }
    
    // 多邊形工具：更新滑鼠位置以繪製動態預覽
    if (currentTool === 'polygon' && polygonPoints.length > 0) {
      setMousePosition({ x, y });
    }
    
    // 拖曳控制點
    if (draggingPointIndex !== null) {
      const newPoints = [...controlPoints];
      newPoints[draggingPointIndex] = { ...newPoints[draggingPointIndex], x, y };
      setControlPoints(newPoints);
      setHoverEdgePoint(null);
      return;
    }
    
    // 檢查是否懸停在邊界線上（顯示可新增控制點的提示）
    if (editingAnnotationId && controlPoints.length >= 3 && !isDragging && !isDrawingBox) {
      const pointIndex = findControlPointAtPosition(x, y);
      if (pointIndex === null) {
        // 沒有懸停在控制點上，檢查是否在邊界線上
        const edgeHitRadius = 15 / scale;
        const result = findNearestEdgePosition(x, y);
        if (result && result.distance < edgeHitRadius) {
          setHoverEdgePoint(result.point);
        } else {
          setHoverEdgePoint(null);
        }
      } else {
        setHoverEdgePoint(null);
      }
    } else {
      setHoverEdgePoint(null);
    }
    
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else if (isDrawingBox) {
      setTempBox({
        x1: Math.min(boxStart.x, x),
        y1: Math.min(boxStart.y, y),
        x2: Math.max(boxStart.x, x),
        y2: Math.max(boxStart.y, y)
      });
    }
  }, [currentImage, isDragging, isDrawingBox, dragStart, boxStart, screenToImage, setTempBox, draggingPointIndex, controlPoints, isPasting, currentTool, polygonPoints, editingAnnotationId, scale, findControlPointAtPosition, findNearestEdgePosition]);

  // 處理滑鼠釋放
  const handleMouseUp = useCallback(() => {
    // 如果正在拖曳控制點，完成後更新遮罩
    if (draggingPointIndex !== null && editingAnnotationId && controlPoints.length >= 3) {
      const selectedAnn = annotations.find(ann => ann.id === editingAnnotationId);
      if (selectedAnn) {
        const [height, width] = selectedAnn.segmentation.size;
        const newMask = polygonToMask(controlPoints, width, height);
        const newRLE = maskToRLE(newMask, width, height);
        const newArea = newMask.reduce((a, b) => a + b, 0);
        
        // 計算新的 bbox
        let minX = width, minY = height, maxX = 0, maxY = 0;
        for (const p of controlPoints) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        
        updateAnnotation(editingAnnotationId, {
          segmentation: newRLE,
          bbox: [minX, minY, maxX - minX, maxY - minY],
          area: newArea
        });
      }
      setDraggingPointIndex(null);
      return;
    }
    
    setIsDragging(false);
    
    if (isDrawingBox && tempBox) {
      setIsDrawingBox(false);
      // 如果框選面積太小，清除
      const area = Math.abs((tempBox.x2 - tempBox.x1) * (tempBox.y2 - tempBox.y1));
      if (area < 100) {
        setTempBox(null);
      } else if (currentTool === 'template') {
        // 模板工具：儲存為模板
        saveTemplate(tempBox);
      } else {
        // 框選工具：呼叫 API 進行分割預覽
        updateBoxPreview(tempBox);
      }
    }
  }, [isDrawingBox, tempBox, setTempBox, draggingPointIndex, editingAnnotationId, controlPoints, annotations, updateAnnotation, updateBoxPreview, currentTool, saveTemplate]);

  // 處理滾輪縮放（以滑鼠位置為中心）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    
    // 滑鼠在容器中的位置
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 滑鼠在圖片座標系中的位置（縮放前）
    const imageX = (mouseX - offset.x) / scale;
    const imageY = (mouseY - offset.y) / scale;
    
    // 計算新的縮放比例
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * delta));
    
    // 計算新的偏移量，使滑鼠位置在縮放後仍指向同一個圖片座標
    const newOffsetX = mouseX - imageX * newScale;
    const newOffsetY = mouseY - imageY * newScale;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [scale, offset]);

  // 初始化和圖片變更時重繪
  useEffect(() => {
    drawMainCanvas();
  }, [drawMainCanvas]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // 自動縮放以適應容器
  useEffect(() => {
    if (!currentImage || !containerRef.current) return;
    
    const container = containerRef.current;
    const scaleX = container.clientWidth / currentImage.width;
    const scaleY = container.clientHeight / currentImage.height;
    const fitScale = Math.min(scaleX, scaleY, 1);
    
    setScale(fitScale);
    setOffset({
      x: (container.clientWidth - currentImage.width * fitScale) / 2,
      y: (container.clientHeight - currentImage.height * fitScale) / 2
    });
  }, [currentImage]);

  // 獲取游標樣式
  const getCursorClass = () => {
    // 拖曳中使用抓取游標
    if (isDragging) return 'cursor-grabbing';
    
    // 貼上模式使用特殊游標
    if (isPasting) return 'tool-paste';
    
    switch (currentTool) {
      case 'pointer': return 'tool-pointer';
      case 'add-point': return 'tool-add-point';
      case 'remove-point': return 'tool-remove-point';
      case 'box': return 'tool-box';
      case 'text': return 'tool-text';
      case 'template': return 'tool-template';
      case 'polygon': return 'tool-polygon';
      default: return '';
    }
  };

  if (!currentImage) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400">
        <div className="text-center">
          <div className="text-6xl mb-4">🖼️</div>
          <p className="text-lg mb-2 text-slate-500">請上傳圖片開始標註</p>
          <p className="text-sm">支援 JPG, PNG, WebP, BMP 格式</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`flex-1 overflow-hidden bg-slate-800 relative annotation-canvas ${getCursorClass()}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onAuxClick={(e) => e.preventDefault()}  // 阻止中鍵預設行為（自動滾動）
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
          position: 'absolute'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', top: 0, left: 0 }}
        />
        <canvas
          ref={overlayRef}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        />
      </div>
      
      {/* 縮放指示器 */}
      <div className="absolute bottom-4 right-4 bg-slate-900/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm font-medium">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
}
