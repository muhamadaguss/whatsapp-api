const XLSX = require('xlsx');
const { asyncHandler, AppError } = require('../middleware/errorHandler');

const downloadTemplate = asyncHandler((req, res) => {
    // 1. Buat workbook baru
    const workbook = XLSX.utils.book_new();
    
    // 2. Isi data template dengan format lengkap untuk Enhanced Blast
    const worksheetData = [
      ["no", "name", "company", "custom1", "custom2"], // Header
      ["628123456789", "John Doe", "Tech Corp", "Manager", "Jakarta"], // Contoh baris 1
      ["628987654321", "Jane Smith", "StartupX", "CEO", "Bandung"], // Contoh baris 2
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // 3. Set width kolom agar lebih mudah dibaca
    worksheet['!cols'] = [
        { wch: 15 }, // no column
        { wch: 20 }, // name column  
        { wch: 20 }, // company column
        { wch: 15 }, // custom1 column
        { wch: 15 }, // custom2 column
    ];

    // 4. Tambahkan worksheet ke workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template');

    // 5. Tulis workbook ke buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // 6. Kirim response sebagai file download
    res.setHeader('Content-Disposition', 'attachment; filename="whatsapp_blast_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
})

module.exports = { downloadTemplate }