const XLSX = require('xlsx');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const downloadTemplate = asyncHandler((req, res) => {
    const workbook = XLSX.utils.book_new();
    const worksheetData = [
      ["no", "name", "company", "custom1", "custom2"], 
      ["628123456789", "John Doe", "Tech Corp", "Manager", "Jakarta"], 
      ["628987654321", "Jane Smith", "StartupX", "CEO", "Bandung"], 
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
        { wch: 15 }, 
        { wch: 20 }, 
        { wch: 20 }, 
        { wch: 15 }, 
        { wch: 15 }, 
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="whatsapp_blast_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
})
module.exports = { downloadTemplate }
