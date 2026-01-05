const { invoke } = window.__TAURI__.core;
const { open, save } = window.__TAURI__.dialog;
const { getCurrentWindow } = window.__TAURI__.window;
const { open: openUrl } = window.__TAURI__.opener;

const ROWS_PER_PAGE = 100;

const state = {
  filePath: null,
  fileType: null,
  jsonFormat: 'array',
  headers: [],
  rows: [],
  originalRows: [],
  originalHeaders: [],
  isModified: false,
  editingCell: null,
  selectedRowIndex: null,
  searchQuery: '',
  currentPage: 0,
  totalPages: 0,
  history: [],
  historyIndex: -1,
  columnTypes: [],
};

const elements = {
  welcomeScreen: document.getElementById('welcomeScreen'),
  mainContent: document.getElementById('mainContent'),
  fileActions: document.getElementById('fileActions'),
  dropZone: document.getElementById('dropZone'),
  openFileBtn: document.getElementById('openFileBtn'),
  newFileBtn: document.getElementById('newFileBtn'),
  saveBtn: document.getElementById('saveBtn'),
  exportBtn: document.getElementById('exportBtn'),
  addRowBtn: document.getElementById('addRowBtn'),
  addColBtn: document.getElementById('addColBtn'),
  searchInput: document.getElementById('searchInput'),
  fileName: document.getElementById('fileName'),
  fileType: document.getElementById('fileType'),
  rowCount: document.getElementById('rowCount'),
  colCount: document.getElementById('colCount'),
  tableHead: document.getElementById('tableHead'),
  tableBody: document.getElementById('tableBody'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  toastContainer: document.getElementById('toastContainer'),
  addRowModal: document.getElementById('addRowModal'),
  addRowForm: document.getElementById('addRowForm'),
  addColModal: document.getElementById('addColModal'),
  newColName: document.getElementById('newColName'),
  exportModal: document.getElementById('exportModal'),
  exportFormat: document.getElementById('exportFormat'),
  contextMenu: document.getElementById('contextMenu'),
  pagination: document.getElementById('pagination'),
  pageInfo: document.getElementById('pageInfo'),
  prevPageBtn: document.getElementById('prevPageBtn'),
  nextPageBtn: document.getElementById('nextPageBtn'),
  firstPageBtn: document.getElementById('firstPageBtn'),
  lastPageBtn: document.getElementById('lastPageBtn'),
  minimizeBtn: document.getElementById('minimizeBtn'),
  maximizeBtn: document.getElementById('maximizeBtn'),
  closeBtn: document.getElementById('closeBtn'),
};

function init() {
  setupEventListeners();
  setupDragAndDrop();
}

function setupEventListeners() {
  elements.openFileBtn.addEventListener('click', openFile);
  elements.dropZone.addEventListener('click', openFile);
  elements.newFileBtn.addEventListener('click', createNewFile);
  elements.saveBtn.addEventListener('click', saveFile);
  elements.exportBtn.addEventListener('click', showExportModal);
  elements.addRowBtn.addEventListener('click', addRow);
  elements.addColBtn.addEventListener('click', showAddColModal);

  elements.searchInput.addEventListener('input', handleSearch);

  elements.prevPageBtn.addEventListener('click', () => goToPage(state.currentPage - 1));
  elements.nextPageBtn.addEventListener('click', () => goToPage(state.currentPage + 1));
  elements.firstPageBtn.addEventListener('click', () => goToPage(0));
  elements.lastPageBtn.addEventListener('click', () => goToPage(state.totalPages - 1));

  document.getElementById('closeAddRowModal').addEventListener('click', hideAddRowModal);
  document.getElementById('cancelAddRow').addEventListener('click', hideAddRowModal);
  document.getElementById('confirmAddRow').addEventListener('click', addRow);

  document.getElementById('closeAddColModal').addEventListener('click', hideAddColModal);
  document.getElementById('cancelAddCol').addEventListener('click', hideAddColModal);
  document.getElementById('confirmAddCol').addEventListener('click', addColumn);

  document.getElementById('closeExportModal').addEventListener('click', hideExportModal);
  document.getElementById('cancelExport').addEventListener('click', hideExportModal);
  document.getElementById('confirmExport').addEventListener('click', exportFile);

  document.getElementById('ctxEditCell').addEventListener('click', contextEditCell);
  document.getElementById('ctxDuplicateRow').addEventListener('click', contextDuplicateRow);
  document.getElementById('ctxDeleteRow').addEventListener('click', contextDeleteRow);

  document.addEventListener('click', (e) => {
    if (!elements.contextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  document.addEventListener('keydown', handleKeyboard);

  elements.minimizeBtn.addEventListener('click', async () => await getCurrentWindow().minimize());
  elements.maximizeBtn.addEventListener('click', async () => await getCurrentWindow().toggleMaximize());
  elements.closeBtn.addEventListener('click', async () => await getCurrentWindow().close());

  const authorLink = document.getElementById('authorLink');
  if (authorLink) {
    authorLink.addEventListener('click', (e) => {
      e.preventDefault();
      openUrl('https://github.com/askoq');
    });
  }
}

function setupDragAndDrop() {
  const dropZone = elements.dropZone;

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const path = file.path || file.name;
      await loadFile(path);
    }
  });
}

async function openFile() {
  try {
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Data Files',
        extensions: ['json', 'jsonl', 'csv']
      }]
    });

    if (selected) {
      await loadFile(selected);
    }
  } catch (error) {
    showToast('Error: ' + error, 'error');
  }
}

function detectTypes(rows) {
  if (!rows || rows.length === 0) return [];
  const width = rows[0].length;
  const types = new Array(width).fill('string');
  const sampleSize = Math.min(rows.length, 100);

  for (let col = 0; col < width; col++) {
    let numCount = 0;
    let boolCount = 0;
    let nonEmpty = 0;

    for (let i = 0; i < sampleSize; i++) {
      const val = rows[i][col];
      if (val === '' || val === null || val === undefined) continue;
      nonEmpty++;

      if (!isNaN(parseFloat(val)) && isFinite(val)) numCount++;
      if (String(val).trim().toLowerCase() === 'true' || String(val).trim().toLowerCase() === 'false') boolCount++;
    }

    if (nonEmpty > 0) {
      if (numCount / nonEmpty > 0.9) types[col] = 'number';
      else if (boolCount / nonEmpty > 0.9) types[col] = 'boolean';
    }
  }
  return types;
}

async function loadFile(filePath) {
  try {
    showStatus('Loading...');

    const result = await invoke('load_file', { filePath });

    state.filePath = result.file_path;
    state.fileType = result.file_type;
    state.jsonFormat = result.json_format || 'array';
    state.headers = result.headers;
    state.rows = result.rows;
    state.columnTypes = detectTypes(state.rows);
    state.originalRows = JSON.parse(JSON.stringify(result.rows));
    state.originalHeaders = [...result.headers];
    state.isModified = false;
    state.currentPage = 0;

    updatePagination();
    renderTable();
    showMainContent();
    updateFileInfo();
    showStatus('Ready');
    showToast(`Loaded ${state.rows.length} rows`, 'success');
  } catch (error) {
    showStatus('Error');
    showToast('Error loading file: ' + error, 'error');
  }
}

async function saveFile() {
  if (!state.filePath) {
    try {
      const filePath = await save({
        filters: [{
          name: state.fileType?.toUpperCase() || 'JSON',
          extensions: [state.fileType || 'json']
        }]
      });

      if (filePath) {
        state.filePath = filePath;
      } else {
        return;
      }
    } catch (error) {
      showToast('Error: ' + error, 'error');
      return;
    }
  }

  try {
    showStatus('Saving...');

    await invoke('save_file', {
      request: {
        file_path: state.filePath,
        file_type: state.fileType,
        json_format: state.jsonFormat,
        headers: state.headers,
        rows: state.rows,
      }
    });

    state.originalRows = JSON.parse(JSON.stringify(state.rows));
    state.originalHeaders = [...state.headers];
    state.isModified = false;
    updateModifiedStatus();
    updateFileInfo();
    showStatus('Ready');
    showToast('Saved', 'success');
  } catch (error) {
    showStatus('Error');
    showToast('Error saving: ' + error, 'error');
  }
}

async function exportFile() {
  const format = elements.exportFormat.value;

  try {
    const filePath = await save({
      filters: [{
        name: format.toUpperCase(),
        extensions: [format]
      }]
    });

    if (filePath) {
      showStatus('Exporting...');

      await invoke('export_file', {
        request: {
          file_path: state.filePath || '',
          file_type: state.fileType || 'json',
          json_format: state.jsonFormat,
          headers: state.headers,
          rows: state.rows,
        },
        exportPath: filePath,
        exportType: format,
      });

      hideExportModal();
      showStatus('Ready');
      showToast('Exported', 'success');
    }
  } catch (error) {
    showStatus('Error');
    showToast('Error: ' + error, 'error');
  }
}

function createNewFile() {
  state.filePath = null;
  state.fileType = 'json';
  state.headers = ['column1', 'column2', 'column3'];
  state.rows = [['', '', '']];
  state.originalRows = [['', '', '']];
  state.originalHeaders = ['column1', 'column2', 'column3'];
  state.isModified = true;
  state.currentPage = 0;

  updatePagination();
  renderTable();
  showMainContent();
  updateFileInfo();
  showToast('New file', 'success');
}

function updatePagination() {
  const filteredRows = getFilteredRows();
  state.totalPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));

  if (state.currentPage >= state.totalPages) {
    state.currentPage = state.totalPages - 1;
  }
  if (state.currentPage < 0) {
    state.currentPage = 0;
  }

  updatePaginationUI();
}

function updatePaginationUI() {
  const filteredRows = getFilteredRows();
  const start = state.currentPage * ROWS_PER_PAGE + 1;
  const end = Math.min((state.currentPage + 1) * ROWS_PER_PAGE, filteredRows.length);

  elements.pageInfo.textContent = `${start}-${end} of ${filteredRows.length}`;

  elements.firstPageBtn.disabled = state.currentPage === 0;
  elements.prevPageBtn.disabled = state.currentPage === 0;
  elements.nextPageBtn.disabled = state.currentPage >= state.totalPages - 1;
  elements.lastPageBtn.disabled = state.currentPage >= state.totalPages - 1;
}

function goToPage(page) {
  if (page < 0 || page >= state.totalPages) return;
  state.currentPage = page;
  renderTableBody();
  updatePaginationUI();
  elements.tableBody.parentElement.scrollTop = 0;
}

function renderTable() {
  renderTableHeader();
  renderTableBody();
  updateStats();
  updatePaginationUI();
}

function renderTableHeader() {
  const headerRow = document.createElement('tr');

  const indexTh = document.createElement('th');
  indexTh.className = 'row-number';
  indexTh.textContent = '#';
  headerRow.appendChild(indexTh);

  state.headers.forEach((header, index) => {
    const th = document.createElement('th');
    th.innerHTML = `
      <div class="header-content">
        <span class="header-text" data-index="${index}">${escapeHtml(header)}</span>
        <div class="header-actions">
          <button class="header-action-btn delete" data-index="${index}" title="Delete column">×</button>
        </div>
      </div>
    `;

    th.querySelector('.header-text').addEventListener('dblclick', (e) => {
      editHeader(index, e.target);
    });

    th.querySelector('.header-action-btn.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteColumn(index);
    });

    headerRow.appendChild(th);
  });

  const actionsTh = document.createElement('th');
  actionsTh.style.width = '50px';
  headerRow.appendChild(actionsTh);

  elements.tableHead.innerHTML = '';
  elements.tableHead.appendChild(headerRow);
}

function renderTableBody() {
  const filteredRows = getFilteredRows();
  const startIdx = state.currentPage * ROWS_PER_PAGE;
  const endIdx = Math.min(startIdx + ROWS_PER_PAGE, filteredRows.length);
  const pageRows = filteredRows.slice(startIdx, endIdx);

  elements.tableBody.innerHTML = '';

  const fragment = document.createDocumentFragment();

  pageRows.forEach((rowData) => {
    const actualIndex = rowData.originalIndex;
    const row = rowData.data;
    const tr = document.createElement('tr');
    tr.dataset.index = actualIndex;

    const indexTd = document.createElement('td');
    indexTd.className = 'row-number';
    indexTd.textContent = actualIndex + 1;
    tr.appendChild(indexTd);

    row.forEach((cell, cellIndex) => {
      const td = document.createElement('td');
      td.className = 'editable';
      if (state.columnTypes && state.columnTypes[cellIndex]) {
        const type = state.columnTypes[cellIndex];
        const valStr = String(cell).trim();
        if (cell !== '' && cell !== null) {
          if (type === 'number' && isNaN(parseFloat(valStr))) {
            td.classList.add('cell-invalid');
            td.title = 'Expected number';
          } else if (type === 'boolean' && valStr.toLowerCase() !== 'true' && valStr.toLowerCase() !== 'false') {
            td.classList.add('cell-invalid');
            td.title = 'Expected boolean';
          }
        }
      }

      if (state.searchQuery && String(cell).toLowerCase().includes(state.searchQuery.toLowerCase())) {
        const query = state.searchQuery.toLowerCase();
        const str = String(cell);
        const index = str.toLowerCase().indexOf(query);
        const before = escapeHtml(str.substring(0, index));
        const match = escapeHtml(str.substring(index, index + query.length));
        const after = escapeHtml(str.substring(index + query.length));
        td.innerHTML = `${before}<mark>${match}</mark>${after}`;
      } else {
        td.textContent = cell;
      }

      td.dataset.row = actualIndex;
      td.dataset.col = cellIndex;

      td.addEventListener('dblclick', () => {
        startCellEdit(td, actualIndex, cellIndex);
      });

      td.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        state.selectedRowIndex = actualIndex;
        state.editingCell = { row: actualIndex, col: cellIndex };
        showContextMenu(e.pageX, e.pageY);
      });

      tr.appendChild(td);
    });

    const actionsTd = document.createElement('td');
    actionsTd.innerHTML = `
      <div class="row-actions">
        <button class="row-action-btn delete" title="Delete">×</button>
      </div>
    `;

    actionsTd.querySelector('.delete').addEventListener('click', () => {
      deleteRow(actualIndex);
    });

    tr.appendChild(actionsTd);
    fragment.appendChild(tr);
  });

  elements.tableBody.appendChild(fragment);
}

function getFilteredRows() {
  const query = state.searchQuery.toLowerCase();

  return state.rows
    .map((row, index) => ({ data: row, originalIndex: index }))
    .filter(({ data }) => {
      if (!query) return true;
      return data.some(cell => String(cell).toLowerCase().includes(query));
    });
}

function startCellEdit(td, rowIndex, colIndex) {
  if (state.editingCell && state.editingCell.input) {
    finishCellEdit();
  }

  const currentValue = state.rows[rowIndex][colIndex];

  td.classList.add('editing');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.value = currentValue;

  td.textContent = '';
  td.appendChild(input);

  input.focus();
  input.select();

  state.editingCell = { element: td, row: rowIndex, col: colIndex, input };

  input.addEventListener('blur', finishCellEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      finishCellEdit();
    } else if (e.key === 'Escape') {
      cancelCellEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      finishCellEdit();
      const nextCol = colIndex + 1;
      if (nextCol < state.headers.length) {
        const nextTd = elements.tableBody.querySelector(`td[data-row="${rowIndex}"][data-col="${nextCol}"]`);
        if (nextTd) startCellEdit(nextTd, rowIndex, nextCol);
      }
    }
  });
}

function finishCellEdit() {
  if (!state.editingCell || !state.editingCell.input) return;

  const { element, row, col, input } = state.editingCell;
  const newValue = input.value;
  const oldValue = state.rows[row][col];

  if (newValue !== oldValue) {
    state.rows[row][col] = newValue;
    pushHistory({
      type: 'edit_cell',
      row,
      col,
      oldVal: oldValue,
      newVal: newValue
    });
    checkModified();
  }

  element.classList.remove('editing');
  element.textContent = newValue;

  state.editingCell = null;
}

function cancelCellEdit() {
  if (!state.editingCell) return;

  const { element, row, col } = state.editingCell;
  element.classList.remove('editing');
  element.textContent = state.rows[row][col];

  state.editingCell = null;
}

function editHeader(index, element) {
  const currentValue = state.headers[index];

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.value = currentValue;
  input.style.width = '100%';

  element.textContent = '';
  element.appendChild(input);
  input.focus();
  input.select();

  const finishEdit = () => {
    const newValue = input.value || currentValue;
    state.headers[index] = newValue;
    element.textContent = newValue;
    checkModified();
  };

  input.addEventListener('blur', finishEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
    } else if (e.key === 'Escape') {
      element.textContent = currentValue;
    }
  });
}

function showAddColModal() {
  elements.newColName.value = '';
  elements.addColModal.style.display = 'flex';
  elements.newColName.focus();
}

function hideAddColModal() {
  elements.addColModal.style.display = 'none';
}

function addColumn() {
  const name = elements.newColName.value.trim() || `column${state.headers.length + 1}`;

  state.headers.push(name);
  state.rows.forEach(row => row.push(''));

  pushHistory({
    type: 'add_col',
    index: state.headers.length - 1,
    name
  });

  renderTable();
  hideAddColModal();
  showToast('Column added', 'success');
}

function deleteColumn(index) {
  if (state.headers.length <= 1) {
    showToast('Cannot delete last column', 'warning');
    return;
  }

  const name = state.headers[index];
  const colData = state.rows.map(row => row[index]);

  state.headers.splice(index, 1);
  state.rows.forEach(row => row.splice(index, 1));

  pushHistory({
    type: 'delete_col',
    index,
    name,
    colData
  });

  renderTable();
  showToast('Column deleted', 'success');
}

function addRow() {
  const newRow = state.headers.map(() => '');

  state.rows.push(newRow);

  pushHistory({
    type: 'add_row',
    index: state.rows.length - 1,
    rowData: [...newRow]
  });

  updatePagination();

  state.currentPage = state.totalPages - 1;
  renderTableBody();
  updateStats();
  updatePaginationUI();
  showToast('Row added', 'success');

  setTimeout(() => {
    const newRowIndex = state.rows.length - 1;
    const firstCell = elements.tableBody.querySelector(`td[data-index="${newRowIndex}"][data-col="0"]`);
    if (firstCell) {
      startCellEdit(firstCell, newRowIndex, 0);
    }
  }, 50);
}

function hideAddRowModal() {
  elements.addRowModal.style.display = 'none';
}

function deleteRow(index) {
  if (state.rows.length <= 1) {
    showToast('Cannot delete last row', 'warning');
    return;
  }

  const rowData = [...state.rows[index]];
  state.rows.splice(index, 1);

  pushHistory({
    type: 'delete_row',
    index,
    rowData
  });

  updatePagination();
  renderTableBody();
  updateStats();
  showToast('Row deleted', 'success');
}

function duplicateRow(index) {
  const rowCopy = [...state.rows[index]];
  state.rows.splice(index + 1, 0, rowCopy);
  updatePagination();
  renderTableBody();
  updateStats();
  checkModified();
  showToast('Row duplicated', 'success');
}

function showContextMenu(x, y) {
  elements.contextMenu.style.display = 'block';
  elements.contextMenu.style.left = `${x}px`;
  elements.contextMenu.style.top = `${y}px`;
}

function hideContextMenu() {
  elements.contextMenu.style.display = 'none';
}

function contextEditCell() {
  hideContextMenu();
  if (state.editingCell) {
    const { row, col } = state.editingCell;
    const td = document.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
    if (td) startCellEdit(td, row, col);
  }
}

function contextDuplicateRow() {
  hideContextMenu();
  if (state.selectedRowIndex !== null) {
    duplicateRow(state.selectedRowIndex);
  }
}

function contextDeleteRow() {
  hideContextMenu();
  if (state.selectedRowIndex !== null) {
    deleteRow(state.selectedRowIndex);
  }
}

function showExportModal() {
  elements.exportModal.style.display = 'flex';
}

function hideExportModal() {
  elements.exportModal.style.display = 'none';
}

function handleSearch(e) {
  state.searchQuery = e.target.value;
  state.currentPage = 0;
  updatePagination();
  renderTableBody();
}

function pushHistory(command) {
  if (state.historyIndex < state.history.length - 1) {
    state.history = state.history.slice(0, state.historyIndex + 1);
  }

  state.history.push(command);
  state.historyIndex++;

  if (state.history.length > 50) {
    state.history.shift();
    state.historyIndex--;
  }
  checkModified();
}

function undo() {
  if (state.historyIndex < 0) return;

  const command = state.history[state.historyIndex];

  switch (command.type) {
    case 'edit_cell':
      state.rows[command.row][command.col] = command.oldVal;
      renderTableBody();
      break;
    case 'add_row':
      state.rows.splice(command.index, 1);
      updatePagination();
      renderTableBody();
      updatePaginationUI();
      break;
    case 'delete_row':
      state.rows.splice(command.index, 0, command.rowData);
      updatePagination();
      renderTableBody();
      updatePaginationUI();
      break;
    case 'add_col':
      state.headers.splice(command.index, 1);
      state.rows.forEach(row => row.splice(command.index, 1));
      renderTable();
      break;
    case 'delete_col':
      state.headers.splice(command.index, 0, command.name);
      state.rows.forEach((row, i) => row.splice(command.index, 0, command.colData[i]));
      renderTable();
      break;
  }

  state.historyIndex--;
  checkModified();
  showToast('Undo', 'info');
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;

  state.historyIndex++;
  const command = state.history[state.historyIndex];

  switch (command.type) {
    case 'edit_cell':
      state.rows[command.row][command.col] = command.newVal;
      renderTableBody();
      break;
    case 'add_row':
      state.rows.splice(command.index, 0, command.rowData);
      updatePagination();
      renderTableBody();
      updatePaginationUI();
      break;
    case 'delete_row':
      state.rows.splice(command.index, 1);
      updatePagination();
      renderTableBody();
      updatePaginationUI();
      break;
    case 'add_col':
      state.headers.splice(command.index, 0, command.name);
      state.rows.forEach(row => row.splice(command.index, 0, ''));
      renderTable();
      break;
    case 'delete_col':
      state.headers.splice(command.index, 1);
      state.rows.forEach(row => row.splice(command.index, 1));
      renderTable();
      break;
  }

  checkModified();
  showToast('Redo', 'info');
}

function handleKeyboard(e) {
  if (e.ctrlKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
    return;
  }

  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    saveFile();
  }

  if (e.ctrlKey && e.key === 'o') {
    e.preventDefault();
    openFile();
  }

  if (e.ctrlKey && e.key === 'n') {
    e.preventDefault();
    createNewFile();
  }

  if (e.key === 'PageDown') {
    e.preventDefault();
    goToPage(state.currentPage + 1);
  }
  if (e.key === 'PageUp') {
    e.preventDefault();
    goToPage(state.currentPage - 1);
  }

  if (e.key === 'Escape') {
    cancelCellEdit();
    hideContextMenu();
    hideAddRowModal();
    hideAddColModal();
    hideExportModal();
  }
}

function showMainContent() {
  elements.welcomeScreen.style.display = 'none';
  elements.mainContent.style.display = 'flex';
  if (elements.fileActions) {
    elements.fileActions.style.display = 'flex';
  }
}

function updateFileInfo() {
  const fileName = state.filePath
    ? state.filePath.split(/[/\\]/).pop()
    : 'Untitled';

  elements.fileName.textContent = fileName;
  elements.fileType.textContent = state.fileType?.toUpperCase() || 'NEW';
  updateStats();
  updateModifiedStatus();
}

function updateStats() {
  elements.rowCount.textContent = `${state.rows.length} rows`;
  elements.colCount.textContent = `${state.headers.length} cols`;
}

function checkModified() {
  const rowsChanged = JSON.stringify(state.rows) !== JSON.stringify(state.originalRows);
  const headersChanged = JSON.stringify(state.headers) !== JSON.stringify(state.originalHeaders);
  state.isModified = rowsChanged || headersChanged;
  updateModifiedStatus();
}

function updateModifiedStatus() {
  if (state.isModified) {
    elements.statusDot.classList.add('modified');
    elements.statusText.textContent = 'Modified';
  } else {
    elements.statusDot.classList.remove('modified');
    elements.statusText.textContent = 'Ready';
  }
}

function showStatus(text) {
  elements.statusText.textContent = text;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = { success: '✓', error: '✗', warning: '!' };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span>${escapeHtml(message)}</span>
  `;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function disableBrowserFeatures() {
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;

    const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable;
    if (!isInput) {
      e.preventDefault();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
      e.preventDefault();
    }
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I'))) {
      e.preventDefault();
    }
    if (e.ctrlKey && e.shiftKey && (e.key === 'j' || e.key === 'J')) {
      e.preventDefault();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  disableBrowserFeatures();
});
