import React, { useState, useRef } from 'react';
import { Dish, DishCategory } from '../types';
import { siliconflowService } from '../services/siliconflowService';
import { ArrowPathIcon, SparklesIcon } from './Icons';

type PdfPageProxy = {
  getTextContent: (params?: { disableCombineTextItems?: boolean }) => Promise<{ items: unknown[] }>;
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: any) => { promise: Promise<void> };
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
};

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocumentProxy> };
};

let pdfModulePromise: Promise<PdfJsModule> | null = null;

async function loadPdfModule(): Promise<PdfJsModule> {
  if (!pdfModulePromise) {
    const pdfModulePath = 'pdfjs-dist/legacy/build/pdf.js';
    pdfModulePromise = import(/* @vite-ignore */ pdfModulePath).then(async (module) => {
      const pdfjs = module as unknown as PdfJsModule;
      try {
        const workerModulePath = 'pdfjs-dist/legacy/build/pdf.worker.js?url';
        const workerModule = await import(/* @vite-ignore */ workerModulePath);
        const workerSrc =
          (workerModule as { default?: string }).default ?? (workerModule as unknown as string);
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      } catch (error) {
        console.warn('Falling back to CDN pdf.js worker after import error.', error);
        pdfjs.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      return pdfjs;
    });
  }

  return pdfModulePromise;
}

// Declare global variables for libraries loaded from CDN
declare global {
  interface Window {
    mammoth: any;
  }
}

interface DishManagerProps {
  dishes: Dish[];
  setDishes: React.Dispatch<React.SetStateAction<Dish[]>>;
}

const DishForm: React.FC<{ onSave: (dish: Dish) => void, onCancel: () => void, currentDish: Dish | null }> = ({ onSave, onCancel, currentDish }) => {
    const isEditing = !!currentDish;
    const [dish, setDish] = useState<Dish>(
        currentDish || {
            id: `dish-${Date.now()}`,
            name: '',
            restaurant: '',
            price: 10,
            protein: 20,
            carbs: 30,
            fat: 15,
            rating: 8,
            category: '主食',
        }
    );
    const [isEstimating, setIsEstimating] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        const numericFields = ['price', 'protein', 'carbs', 'fat', 'rating'];
        if (numericFields.includes(name)) {
            const parsed = parseFloat(value);
            if (name === 'price' && !Number.isNaN(parsed)) {
                setDish((prev) => ({ ...prev, [name]: parseFloat(parsed.toFixed(2)) }));
            } else {
                setDish((prev) => ({ ...prev, [name]: parsed }));
            }
            return;
        }

        setDish(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...dish,
            price: Number.isFinite(dish.price) ? parseFloat(dish.price.toFixed(2)) : 0,
        });
    };

    const handleEstimate = async () => {
        if (!dish.name) {
            alert("Please enter a dish name first.");
            return;
        }
        setIsEstimating(true);
        try {
            const macros = await siliconflowService.estimateDishMacros(dish.name, dish.restaurant);
            setDish(prev => ({
                ...prev,
                protein: Math.round(macros.protein),
                carbs: Math.round(macros.carbs),
                fat: Math.round(macros.fat)
            }));
        } catch (error) {
            alert((error as Error).message);
        } finally {
            setIsEstimating(false);
        }
    };
    
    const categories: DishCategory[] = ['主食', '肉蛋', '蔬菜', '汤羹', '其他'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20 p-4 safe-area-overlay">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg max-h-full overflow-y-auto">
                <h3 className="text-2xl font-bold text-gray-800 mb-6">{isEditing ? 'Edit Dish' : 'Add a New Dish'}</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Dish Name</label>
                            <input type="text" name="name" value={dish.name} onChange={handleChange} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Restaurant</label>
                            <input type="text" name="restaurant" value={dish.restaurant} onChange={handleChange} required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                    </div>

                    <div className="flex justify-between items-center mt-4 mb-2">
                        <h4 className="text-sm font-medium text-gray-700">Nutritional Info</h4>
                        <button
                            type="button"
                            onClick={handleEstimate}
                            disabled={isEstimating || !dish.name}
                            className="flex items-center text-sm text-indigo-600 font-semibold hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isEstimating ? (
                                <ArrowPathIcon className="w-4 h-4 mr-1 animate-spin" />
                            ) : (
                                <SparklesIcon className="w-4 h-4 mr-1" />
                            )}
                            Estimate with AI
                        </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Price (￥)</label>
                            <input type="number" name="price" value={dish.price} onChange={handleChange} min="0" step="0.01" required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Protein (g)</label>
                            <input type="number" name="protein" value={dish.protein} onChange={handleChange} min="0" required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Carbs (g)</label>
                            <input type="number" name="carbs" value={dish.carbs} onChange={handleChange} min="0" required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Fat (g)</label>
                            <input type="number" name="fat" value={dish.fat} onChange={handleChange} min="0" required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Category</label>
                            <select name="category" value={dish.category} onChange={handleChange} className="mt-1 w-full px-3 py-2 border bg-white border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500">
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div>
                             <label className="block text-sm font-medium text-gray-700">Rating (1-10)</label>
                            <input type="number" name="rating" value={dish.rating} onChange={handleChange} min="1" max="10" step="1" required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
                        </div>
                    </div>
                    <div className="flex justify-end space-x-4 pt-4">
                        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700">{isEditing ? 'Update' : 'Add Dish'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Helper to wait for a global library to be available, preventing race conditions.
function waitForMammoth(timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const intervalTime = 100;
        const maxAttempts = timeout / intervalTime;

        const check = () => {
            if (window.mammoth) {
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Word library failed to load. Please check your internet connection or refresh the page.'));
            } else {
                attempts++;
                setTimeout(check, intervalTime);
            }
        };
        check();
    });
}

const ALLOWED_CATEGORIES: DishCategory[] = ['主食', '肉蛋', '蔬菜', '汤羹', '其他'];

function parseStructuredDishText(rawText: string): Partial<Dish>[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#/.test(line));

  const results: Partial<Dish>[] = [];

  for (const line of lines) {
    const normalized = line.replace(/[，、；;\t]+/g, ',');
    const parts = normalized
      .split(/[,|]/)
      .map((part) => part.trim())
      .filter(Boolean);

    const fallbackParts = parts.length >= 4 ? parts : normalized.split(/\s+/).filter(Boolean);
    if (fallbackParts.length < 3) {
      continue;
    }

    const [name, restaurant, priceToken, proteinToken, carbsToken, fatToken, categoryToken] = fallbackParts;
    const price = Number.parseFloat(priceToken);
    if (Number.isNaN(price)) {
      continue;
    }

    const protein = proteinToken ? Number.parseFloat(proteinToken) : NaN;
    const carbs = carbsToken ? Number.parseFloat(carbsToken) : NaN;
    const fat = fatToken ? Number.parseFloat(fatToken) : NaN;
    const category = categoryToken && ALLOWED_CATEGORIES.includes(categoryToken as DishCategory)
      ? (categoryToken as DishCategory)
      : undefined;

    results.push({
      name,
      restaurant,
      price: parseFloat(price.toFixed(2)),
      protein: Number.isNaN(protein) ? undefined : protein,
      carbs: Number.isNaN(carbs) ? undefined : carbs,
      fat: Number.isNaN(fat) ? undefined : fat,
      category,
    });
  }

  return results;
}

const ManualImportModal: React.FC<{
  isOpen: boolean;
  isBusy: boolean;
  onClose: () => void;
  onImport: (text: string) => Promise<void>;
}> = ({ isOpen, isBusy, onClose, onImport }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) {
      setError('请输入需要解析的内容。');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onImport(text);
      setText('');
      onClose();
    } catch (err) {
      console.error(err);
      setError((err as Error).message || '导入失败，请稍后重试。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-30 p-4 safe-area-overlay">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-full overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">粘贴文本导入</h3>
              <p className="text-sm text-gray-600 mt-1">
                支持直接粘贴 PDF/Word/Excel 的纯文本内容，也可以使用逗号或竖线分隔的结构化数据。
              </p>
            </div>
            <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-700">×</button>
          </div>
          <textarea
            className="w-full h-48 border border-gray-300 rounded-lg p-3 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder={
              '示例:\n烤鸡胸, 健身餐厅, 26, 38, 6, 8, 肉蛋\n西红柿鸡蛋面|校园食堂|15|16|52|9|主食\n\n也可以直接粘贴菜单原文，系统会尝试自动识别。'
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={isBusy || isSubmitting}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2 text-xs text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-3">
            <span className="font-semibold text-gray-700">快速格式提示：</span>
            <span>菜名, 餐厅, 价格, 蛋白, 碳水, 脂肪, 分类</span>
            <span>或</span>
            <span>菜名 | 餐厅 | 价格 | 蛋白 | 碳水 | 脂肪 | 分类</span>
            <span>分类可选：主食 / 肉蛋 / 蔬菜 / 汤羹 / 其他</span>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setText('')}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100"
              disabled={isBusy || isSubmitting}
            >
              清空
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-60"
              disabled={isBusy || isSubmitting}
            >
              {isSubmitting || isBusy ? '导入中…' : '导入' }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper function to extract text from different file types
async function getTextFromFile(file: File): Promise<string> {
    const reader = new FileReader();
    const fileType = file.type;
    const fileName = file.name.toLowerCase();

    if (fileType === 'text/plain' || fileName.endsWith('.txt')) {
        return new Promise((resolve, reject) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error("Error reading text file."));
            reader.readAsText(file);
        });
    }

    if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
        const pdfjs = await loadPdfModule();

        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    if (!arrayBuffer) return reject(new Error("Empty PDF file."));
                    const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
                    let textContent = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent({ disableCombineTextItems: false });
                        textContent += text.items
                            .map((item: any) => ('str' in item ? item.str : ''))
                            .join(' ');
                        textContent += '\n';
                    }

                    const trimmed = textContent.replace(/\s+\n/g, '\n').trim();
                    if (trimmed.length > 20) {
                        resolve(trimmed);
                        return;
                    }

                    const imageDataUrls: string[] = [];
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const viewport = page.getViewport({ scale: 2 });
                        const canvas = document.createElement('canvas');
                        const context = canvas.getContext('2d');
                        if (!context) {
                            continue;
                        }
                        const outputScale = window.devicePixelRatio || 1;
                        canvas.width = viewport.width * outputScale;
                        canvas.height = viewport.height * outputScale;
                        const renderContext: any = {
                            canvasContext: context,
                            viewport,
                        };
                        if (outputScale !== 1) {
                            renderContext.transform = [outputScale, 0, 0, outputScale, 0, 0];
                        }
                        await page.render(renderContext).promise;
                        imageDataUrls.push(canvas.toDataURL('image/png'));
                        canvas.width = 0;
                        canvas.height = 0;
                    }

                    if (imageDataUrls.length === 0) {
                        if (trimmed) {
                            return resolve(trimmed);
                        }
                        throw new Error('PDF appears to contain images only.');
                    }

                    const ocrText = await siliconflowService.ocrImagesToText(imageDataUrls);
                    if (!ocrText.trim()) {
                        throw new Error('DeepSeek OCR 未能识别该PDF，请尝试更清晰的扫描或上传文本版菜单。');
                    }

                    resolve(ocrText.trim());
                } catch (err) {
                    console.error("PDF Parsing Error:", err);
                    if (err instanceof Error && err.message) {
                        reject(err);
                    } else {
                        reject(new Error("Failed to parse PDF file. It might be corrupted or image-based."));
                    }
                }
            };
            reader.onerror = () => reject(new Error("Error reading PDF file."));
            reader.readAsArrayBuffer(file);
        });
    }

    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
        await waitForMammoth();

        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    if (!arrayBuffer) return reject(new Error("Empty .docx file."));
                    const result = await window.mammoth.extractRawText({ arrayBuffer });
                    resolve(result.value);
                } catch (err) {
                    console.error("DOCX Parsing Error:", err);
                    reject(new Error("Failed to parse .docx file."));
                }
            };
            reader.onerror = () => reject(new Error("Error reading .docx file."));
            reader.readAsArrayBuffer(file);
        });
    }

    return Promise.reject(new Error(`Unsupported file type: ${file.name}. Please use .txt, .pdf, or .docx.`));
}


const DishManager: React.FC<DishManagerProps> = ({ dishes, setDishes }) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const integrateImportedDishes = (parsedDishes: Partial<Dish>[], originLabel: string, structured: boolean) => {
    const newDishes = parsedDishes
      .map((parsedDish) => {
        const category = ALLOWED_CATEGORIES.includes(parsedDish.category as DishCategory)
          ? (parsedDish.category as DishCategory)
          : '其他';
        const price =
          typeof parsedDish.price === 'number' && !Number.isNaN(parsedDish.price)
            ? parseFloat(parsedDish.price.toFixed(2))
            : 15;
        return {
          id: `dish-${Date.now()}-${Math.random()}`,
          name: parsedDish.name?.trim() || 'Unnamed Dish',
          restaurant: parsedDish.restaurant?.trim() || 'Unknown Restaurant',
          price,
          protein: typeof parsedDish.protein === 'number' && !Number.isNaN(parsedDish.protein) ? parsedDish.protein : 20,
          carbs: typeof parsedDish.carbs === 'number' && !Number.isNaN(parsedDish.carbs) ? parsedDish.carbs : 30,
          fat: typeof parsedDish.fat === 'number' && !Number.isNaN(parsedDish.fat) ? parsedDish.fat : 15,
          rating: 3,
          category,
        } as Dish;
      })
      .filter((newDish) =>
        !dishes.some(
          (existingDish) =>
            existingDish.name.toLowerCase() === newDish.name.toLowerCase() &&
            existingDish.restaurant.toLowerCase() === newDish.restaurant.toLowerCase()
        )
      );

    if (newDishes.length > 0) {
      setDishes((prev) => [...prev, ...newDishes]);
      alert(
        `成功导入 ${newDishes.length} 道新菜品，来源：${originLabel}${structured ? '（结构化解析）' : ''}`
      );
    } else {
      alert('没有检测到新的菜品，可能已经存在列表中。');
    }
  };

  const importDishesFromText = async (rawText: string, originLabel: string) => {
    const cleaned = rawText.replace(/\uFEFF/g, '').trim();
    if (!cleaned) {
      throw new Error('内容为空，无法解析。');
    }

    const structured = parseStructuredDishText(cleaned);
    if (structured.length > 0) {
      integrateImportedDishes(structured, originLabel, true);
      return;
    }

    const parsedDishes = await siliconflowService.parseDishesFromText(cleaned);
    integrateImportedDishes(parsedDishes, originLabel, false);
  };

  const handleAdd = () => {
    setEditingDish(null);
    setIsFormOpen(true);
  };

  const handleEdit = (dish: Dish) => {
    setEditingDish(dish);
    setIsFormOpen(true);
  };

  const handleDelete = (dishId: string) => {
    if (window.confirm('Are you sure you want to delete this dish?')) {
      setDishes(prev => prev.filter(d => d.id !== dishId));
    }
  };

  const handleSave = (dish: Dish) => {
    if (editingDish) {
      setDishes(prev => prev.map(d => d.id === dish.id ? dish : d));
    } else {
      setDishes(prev => [...prev, dish]);
    }
    setIsFormOpen(false);
    setEditingDish(null);
  };
  
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleManualImport = () => {
    setIsManualImportOpen(true);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    try {
        const fileReadPromises = Array.from(files).map(file => getTextFromFile(file));
        const allTexts = await Promise.all(fileReadPromises);
        const combinedText = allTexts.join('\n\n--- MEAL DATA SEPARATOR ---\n\n');

        await importDishesFromText(combinedText, `${files.length} 个文件`);
    } catch (error) {
        console.error(error);
        alert((error as Error).message || "An error occurred during import.");
    } finally {
        setIsImporting(false);
        if(event.target) event.target.value = ''; // Reset the input
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">My Dishes</h2>
          <p className="text-gray-600 mt-1">Add, edit, or import your favorite meals.</p>
        </div>
         <div className="flex items-center space-x-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              style={{ display: 'none' }} 
              accept=".txt,.pdf,.docx" 
              multiple 
            />
            <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex items-center justify-center px-4 py-3 bg-white text-indigo-600 border border-indigo-600 font-semibold rounded-lg shadow-sm hover:bg-indigo-50 transition duration-300 disabled:opacity-50 disabled:cursor-wait"
            >
                {isImporting ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : 'Import from File'}
            </button>
            <button
                onClick={handleManualImport}
                disabled={isImporting}
                className="px-4 py-3 bg-white text-gray-700 border border-gray-300 font-semibold rounded-lg shadow-sm hover:bg-gray-100 transition duration-300 disabled:opacity-50"
            >
                Paste Text
            </button>
            <button onClick={handleAdd} className="px-5 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700">
              Add New Dish
            </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {dishes.length === 0 && (
            <li className="p-8 text-center text-gray-500">
                Your dish list is empty. Add a dish or import a file to get started!
            </li>
          )}
          {dishes.map(dish => (
            <li key={dish.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-bold text-lg text-gray-800">{dish.name}</p>
                  <p className="text-sm text-gray-500">{dish.restaurant}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2 text-gray-600">
                    <span>￥{dish.price.toFixed(2)}</span>
                    <span>P: {dish.protein}g</span>
                    <span>C: {dish.carbs}g</span>
                    <span>F: {dish.fat}g</span>
                    <span>Rating: {dish.rating}/10</span>
                  </div>
                </div>
                <div className="flex space-x-2 ml-4">
                  <button onClick={() => handleEdit(dish)} className="p-2 text-gray-500 hover:text-indigo-600">Edit</button>
                  <button onClick={() => handleDelete(dish.id)} className="p-2 text-gray-500 hover:text-red-600">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isFormOpen && <DishForm onSave={handleSave} onCancel={() => setIsFormOpen(false)} currentDish={editingDish} />}
      <ManualImportModal
        isOpen={isManualImportOpen}
        isBusy={isImporting}
        onClose={() => setIsManualImportOpen(false)}
        onImport={async (text) => {
          setIsImporting(true);
          try {
            await importDishesFromText(text, '手动粘贴');
          } finally {
            setIsImporting(false);
          }
        }}
      />
    </div>
  );
};

export default DishManager;