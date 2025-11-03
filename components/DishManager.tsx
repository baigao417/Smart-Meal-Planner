import React, { useState, useRef } from 'react';
import { Dish, DishCategory } from '../types';
import { geminiService } from '../services/geminiService';
import { ArrowPathIcon, SparklesIcon } from './Icons';

// Declare global variables for libraries loaded from CDN
declare global {
  interface Window {
    pdfjsLib: any;
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
        setDish(prev => ({ ...prev, [name]: numericFields.includes(name) ? parseFloat(value) : value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(dish);
    };

    const handleEstimate = async () => {
        if (!dish.name) {
            alert("Please enter a dish name first.");
            return;
        }
        setIsEstimating(true);
        try {
            const macros = await geminiService.estimateDishMacros(dish.name, dish.restaurant);
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20 p-4">
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
                            <input type="number" name="price" value={dish.price} onChange={handleChange} min="0" step="0.5" required className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"/>
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
function waitForLibrary(libraryName: 'pdfjsLib' | 'mammoth', timeout = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const intervalTime = 100;
        const maxAttempts = timeout / intervalTime;

        const check = () => {
            if (window[libraryName]) {
                resolve();
            } else if (attempts >= maxAttempts) {
                const libDisplayName = libraryName === 'pdfjsLib' ? 'PDF' : 'Word';
                reject(new Error(`${libDisplayName} library failed to load. Please check your internet connection or refresh the page.`));
            } else {
                attempts++;
                setTimeout(check, intervalTime);
            }
        };
        check();
    });
}

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
        await waitForLibrary('pdfjsLib');
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
        
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    if (!arrayBuffer) return reject(new Error("Empty PDF file."));
                    const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
                    let textContent = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        textContent += text.items.map((item: any) => item.str).join(' ');
                        textContent += '\n';
                    }
                    resolve(textContent);
                } catch (err) {
                    console.error("PDF Parsing Error:", err);
                    reject(new Error("Failed to parse PDF file. It might be corrupted or image-based."));
                }
            };
            reader.onerror = () => reject(new Error("Error reading PDF file."));
            reader.readAsArrayBuffer(file);
        });
    }

    if (fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx')) {
        await waitForLibrary('mammoth');

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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsImporting(true);
    try {
        const fileReadPromises = Array.from(files).map(file => getTextFromFile(file));
        const allTexts = await Promise.all(fileReadPromises);
        const combinedText = allTexts.join('\n\n--- MEAL DATA SEPARATOR ---\n\n');

        if (!combinedText.trim()) {
            alert("Files are empty or contain no readable text.");
            return;
        }

        const parsedDishes = await geminiService.parseDishesFromText(combinedText);
        
        const newDishes = parsedDishes
            .map(parsedDish => ({
                id: `dish-${Date.now()}-${Math.random()}`,
                name: parsedDish.name || 'Unnamed Dish',
                restaurant: parsedDish.restaurant || 'Unknown Restaurant',
                price: parsedDish.price || 15,
                protein: parsedDish.protein || 20,
                carbs: parsedDish.carbs || 30,
                fat: parsedDish.fat || 15,
                rating: 3,
                category: parsedDish.category || '其他',
            } as Dish))
            .filter(newDish => 
                !dishes.some(existingDish => 
                    existingDish.name.toLowerCase() === newDish.name.toLowerCase() && 
                    existingDish.restaurant.toLowerCase() === newDish.restaurant.toLowerCase()
                )
            );

        if (newDishes.length > 0) {
            setDishes(prev => [...prev, ...newDishes]);
            alert(`Successfully imported ${newDishes.length} new dishes from ${files.length} file(s)!`);
        } else {
            alert("No new dishes found to import. They might already be in your list.");
        }

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
    </div>
  );
};

export default DishManager;