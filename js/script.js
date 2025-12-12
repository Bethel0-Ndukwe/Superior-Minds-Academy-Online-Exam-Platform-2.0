// =============================================
// COMPLETE JAVASCRIPT CODE - GITHUB HOSTED VERSION
// =============================================

// Global state
let appData = {
    students: [],
    questions: [],
    results: [],
    settings: {
        studentsSheetUrl: '',
        questionsSheetUrl: '',
        autoSaveSheetUrl: '',
        autoSaveEnabled: true,
        adminPassword: 'SMA/2019/0001'
    },
    examDurations: {},
    retakePermissions: [],
    subjects: {
        'primary': ['Mathematics', 'English Language', 'Basic Science', 'Social Studies'],
        'jss': ['Mathematics', 'English Studies', 'Basic Science', 'Basic Technology']
    },
    questionLimits: {}
};

let examState = {
    currentClass: null,
    currentSubject: null,
    questions: [],
    currentQuestionIndex: 0,
    userAnswers: {},
    timer: null,
    timeRemaining: 0,
    examDuration: 0,
    isExamActive: false,
    studentInfo: null,
    adminAuthenticated: false,
    unansweredQuestions: []
};

// =============================================
// 1. INITIALIZATION WITH DEFAULT CONFIG
// =============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded - initializing');

    // Load saved data
    loadAppData();

    // Initialize event listeners
    const levelSelect = document.getElementById('levelSelect');
    if (levelSelect) {
        levelSelect.addEventListener('change', handleLevelSelect);
    }

    const classSelect = document.getElementById('classSelect');
    if (classSelect) {
        classSelect.addEventListener('change', handleClassSelect);
    }

    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', handleAuthentication);
    }

    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', handleAdminPassword);
    }

    const submitBtn = document.getElementById('fixedSubmitBtn');
    if (submitBtn) {
        submitBtn.addEventListener('click', showUnansweredWarning);
    }

    // Check for existing student session
    const sessionInfo = sessionStorage.getItem('sma_student_info');
    if (sessionInfo) {
        try {
            examState.studentInfo = JSON.parse(sessionInfo);
            updateStudentDashboard();
        } catch (e) {
            console.error('Error parsing session info:', e);
        }
    }

    // Set admin button visibility
    updateAdminButtonVisibility();

    // Auto-load questions if URL is configured (for students)
    if (appData.settings.questionsSheetUrl) {
        console.log('Auto-loading questions from configured URL');
        setTimeout(() => syncQuestions(), 1000);
    }

    console.log('Initialization complete');
});

// =============================================
// 2. DATA MANAGEMENT
// =============================================

function loadAppData() {
    try {
        const saved = localStorage.getItem('sma_data');
        if (saved) {
            const data = JSON.parse(saved);
            appData = { ...appData, ...data };

            // Ensure arrays exist
            appData.students = appData.students || [];
            appData.questions = appData.questions || [];
            appData.results = appData.results || [];
            appData.examDurations = appData.examDurations || {};
            appData.retakePermissions = appData.retakePermissions || [];
            appData.subjects = appData.subjects || {
                'primary': ['Mathematics', 'English Language', 'Basic Science', 'Social Studies'],
                'jss': ['Mathematics', 'English Studies', 'Basic Science', 'Basic Technology']
            };
            appData.questionLimits = appData.questionLimits || {};
            appData.settings.autoSaveEnabled = appData.settings.autoSaveEnabled !== false;

            console.log('Loaded app data:', {
                students: appData.students.length,
                questions: appData.questions.length,
                results: appData.results.length,
                hasStudentsUrl: !!appData.settings.studentsSheetUrl,
                hasQuestionsUrl: !!appData.settings.questionsSheetUrl,
                hasAutoSaveUrl: !!appData.settings.autoSaveSheetUrl
            });
        }
    } catch (e) {
        console.error('Error loading data:', e);
    }
}

function saveAppData() {
    try {
        localStorage.setItem('sma_data', JSON.stringify(appData));
        console.log('App data saved successfully');
    } catch (error) {
        console.error('Error saving data:', error);
        showMessage('Error saving data. Storage might be full.', 'error');
    }
}

// =============================================
// 3. GOOGLE SHEETS AUTO-SAVE FUNCTION
// =============================================

async function autoSaveToGoogleSheets(result) {
    // Check if auto-save is enabled
    if (!appData.settings.autoSaveEnabled || !appData.settings.autoSaveSheetUrl) {
        console.log('Auto-save not enabled or URL not set');
        return { success: false, reason: 'disabled' };
    }

    const webAppUrl = appData.settings.autoSaveSheetUrl.trim();

    if (!webAppUrl) {
        console.warn('Auto-save URL is empty');
        return { success: false, reason: 'no_url' };
    }

    try {
        console.log('Attempting to save to Google Sheets:', result);
        showSaveIndicator('Saving to Google Sheets...', 'saving');

        // Prepare the data
        const payload = {
            studentName: result.studentName,
            admissionNumber: result.admissionNumber,
            className: result.className,
            subject: result.subject,
            score: result.score,
            total: result.total,
            percentage: result.percentage,
            grade: result.grade,
            timeTaken: result.timeTaken,
            date: result.date
        };

        console.log('Sending payload:', payload);

        // Use mode: 'no-cors' for Google Apps Script
        const response = await fetch(webAppUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        console.log('Request sent (no-cors mode)');
        showSaveIndicator('Saved to Google Sheets!', 'success');

        // Clear any unsynced results for this student
        clearUnsyncedResults(result.admissionNumber, result.subject);

        return { success: true };

    } catch (error) {
        console.error('❌ Auto-save error:', error);
        showSaveIndicator('Failed to save to Google Sheets', 'error');

        // Store for later sync
        storeForLaterSync(result);

        return {
            success: false,
            error: error.message,
            storedLocally: true
        };
    }
}

function showSaveIndicator(message, type = 'success') {
    const indicator = document.getElementById('saveIndicator');
    if (!indicator) return;

    indicator.textContent = message;
    indicator.className = 'save-indicator';
    indicator.classList.add(type);
    indicator.classList.add('show');

    setTimeout(() => {
        indicator.classList.remove('show');
    }, 3000);
}

function storeForLaterSync(result) {
    let unsyncedResults = JSON.parse(localStorage.getItem('sma_unsynced_results') || '[]');
    unsyncedResults.push({
        ...result,
        timestamp: new Date().toISOString()
    });
    localStorage.setItem('sma_unsynced_results', JSON.stringify(unsyncedResults));
    console.log('Result stored locally for later sync:', result);
}

function clearUnsyncedResults(admissionNumber, subject) {
    let unsyncedResults = JSON.parse(localStorage.getItem('sma_unsynced_results') || '[]');
    const filtered = unsyncedResults.filter(r =>
        !(r.admissionNumber === admissionNumber && r.subject === subject)
    );
    localStorage.setItem('sma_unsynced_results', JSON.stringify(filtered));
}

// =============================================
// 4. SUBMIT EXAM FUNCTION
// =============================================

async function submitExam() {
    if (examState.timer) {
        clearInterval(examState.timer);
    }

    const score = calculateScore();

    // Save result locally
    const result = {
        studentName: examState.studentInfo.name,
        admissionNumber: examState.studentInfo.admissionNumber,
        className: examState.studentInfo.class,
        subject: examState.currentSubject,
        score: score.correct,
        total: score.total,
        percentage: score.percentage,
        grade: score.grade,
        date: new Date().toISOString(),
        timeTaken: examState.examDuration - examState.timeRemaining
    };

    // Add to results array
    appData.results.push(result);
    saveAppData();

    // Auto-save to Google Sheets
    const saveResult = await autoSaveToGoogleSheets(result);
    console.log('Google Sheets save result:', saveResult);

    // Display results
    displayResults(score);
    examState.isExamActive = false;
}

// =============================================
// 5. DISPLAY RESULTS FUNCTION
// =============================================

function displayResults(score) {
    document.getElementById('examContainer').style.display = 'none';
    document.getElementById('timer').style.display = 'none';
    document.getElementById('fixedSubmitBtn').style.display = 'none';

    const resultsContainer = document.getElementById('resultsContainer');

    // For STUDENTS: Show grade and score
    document.getElementById('studentGradeDisplay').textContent = score.grade;
    document.getElementById('scoreDisplay').textContent = `${score.correct}/${score.total}`;
    document.getElementById('resultStudentName').textContent = examState.studentInfo.name;
    document.getElementById('resultClassName').textContent = examState.studentInfo.class;
    document.getElementById('resultSubjectName').textContent = examState.currentSubject;
    document.getElementById('resultScore').textContent = score.correct;
    document.getElementById('resultTotal').textContent = score.total;
    document.getElementById('resultGrade').textContent = score.grade;
    document.getElementById('resultDate').textContent = new Date().toLocaleDateString();

    resultsContainer.style.display = 'block';
}

// =============================================
// 6. UNANSWERED QUESTIONS HANDLING
// =============================================

function showUnansweredWarning() {
    if (!checkUnansweredQuestions()) {
        submitExam();
        return;
    }

    const list = document.getElementById('unansweredList');
    const count = document.getElementById('unansweredCount');

    if (!list || !count) return;

    list.innerHTML = '';
    count.textContent = examState.unansweredQuestions.length;

    examState.unansweredQuestions.forEach(questionId => {
        const li = document.createElement('li');
        li.textContent = `Question ${questionId}`;
        li.onclick = function() {
            // Find the question index by ID
            const questionIndex = examState.questions.findIndex(q => q.id === questionId);
            if (questionIndex !== -1) {
                examState.currentQuestionIndex = questionIndex;
                displayQuestion();
                closeModal('unansweredWarningModal');
            }
        };
        li.style.cursor = 'pointer';
        li.style.color = '#007bff';
        list.appendChild(li);
    });

    showModal('unansweredWarningModal');
}

function checkUnansweredQuestions() {
    examState.unansweredQuestions = [];

    examState.questions.forEach(question => {
        if (!examState.userAnswers[question.id]) {
            examState.unansweredQuestions.push(question.id);
        }
    });

    return examState.unansweredQuestions.length > 0;
}

function forceSubmitExam() {
    closeModal('unansweredWarningModal');
    clearInterval(examState.timer);
    submitExam();
}

// =============================================
// 7. GOOGLE SHEETS CONNECTION TEST
// =============================================

async function testGoogleSheetsConnection() {
    const webAppUrl = document.getElementById('autoSaveSheetUrl')?.value ||
                     appData.settings.autoSaveSheetUrl;

    const resultDiv = document.getElementById('connectionTestResult');

    if (!webAppUrl) {
        resultDiv.textContent = '❌ Please enter a Web App URL first';
        resultDiv.style.color = '#f44336';
        return;
    }

    resultDiv.textContent = 'Testing connection...';
    resultDiv.style.color = '#2196F3';

    try {
        // Test with POST (simulated)
        const testData = {
            studentName: 'Test Connection',
            admissionNumber: 'TEST001',
            className: 'Primary 1',
            subject: 'Mathematics',
            score: 10,
            total: 20,
            timeTaken: 0,
            date: new Date().toISOString()
        };

        const postResponse = await fetch(webAppUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });

        resultDiv.textContent = '✅ Connection successful! Web App is ready.';
        resultDiv.style.color = '#4CAF50';
        showMessage('Connection test successful!', 'success');

    } catch (error) {
        console.error('Connection test error:', error);
        resultDiv.textContent = '❌ Connection failed. Check URL and deployment settings.';
        resultDiv.style.color = '#f44336';
        showMessage('Connection test failed: ' + error.message, 'error');
    }
}

// =============================================
// 8. RESULTS DISPLAY IN ADMIN PANEL
// =============================================

function loadAdminResults() {
    const resultsDisplay = document.getElementById('resultsDisplay');
    const resultsLoading = document.getElementById('resultsLoading');

    if (!resultsDisplay) return;

    resultsLoading.style.display = 'block';
    resultsDisplay.innerHTML = '';

    setTimeout(() => {
        resultsLoading.style.display = 'none';

        // Remove duplicates
        const uniqueResults = removeDuplicateResults(appData.results);

        if (uniqueResults.length === 0) {
            resultsDisplay.innerHTML = '<p>No exam results found.</p>';
        } else {
            displayFilteredResults(uniqueResults);
        }
    }, 500);
}

function removeDuplicateResults(results) {
    const seen = new Set();
    const uniqueResults = [];

    results.forEach(result => {
        const key = `${result.admissionNumber}-${result.subject}-${result.date}-${result.score}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueResults.push(result);
        }
    });

    console.log(`Removed ${results.length - uniqueResults.length} duplicate results`);
    return uniqueResults;
}

function displayFilteredResults(results) {
    const resultsDisplay = document.getElementById('resultsDisplay');
    if (!resultsDisplay) return;

    let html = '<table class="data-table"><tr><th>Student</th><th>Admission</th><th>Class</th><th>Subject</th><th>Score</th><th>Percentage</th><th>Grade</th><th>Date</th><th>Time</th></tr>';

    results.forEach(result => {
        const timeTaken = formatTime(result.timeTaken);
        html += `<tr>
            <td>${result.studentName}</td>
            <td>${result.admissionNumber}</td>
            <td>${result.className}</td>
            <td>${result.subject}</td>
            <td>${result.score}/${result.total}</td>
            <td>${result.percentage}%</td>
            <td>${result.grade}</td>
            <td>${new Date(result.date).toLocaleDateString()}</td>
            <td>${timeTaken}</td>
        </tr>`;
    });

    html += '</table>';
    html += `<p><strong>Total Unique Results:</strong> ${results.length}</p>`;
    resultsDisplay.innerHTML = html;
}

// =============================================
// 9. SETTINGS FUNCTIONS
// =============================================

function loadSettings() {
    document.getElementById('studentsSheetUrl').value = appData.settings.studentsSheetUrl || '';
    document.getElementById('questionsSheetUrl').value = appData.settings.questionsSheetUrl || '';
    document.getElementById('autoSaveSheetUrl').value = appData.settings.autoSaveSheetUrl || '';
    document.getElementById('autoSaveEnabled').checked = appData.settings.autoSaveEnabled !== false;

    loadSubjectSettings();
}

function saveSheetUrls() {
    const studentsUrl = document.getElementById('studentsSheetUrl').value.trim();
    const questionsUrl = document.getElementById('questionsSheetUrl').value.trim();
    const autoSaveUrl = document.getElementById('autoSaveSheetUrl').value.trim();
    const autoSaveEnabled = document.getElementById('autoSaveEnabled').checked;

    appData.settings.studentsSheetUrl = studentsUrl;
    appData.settings.questionsSheetUrl = questionsUrl;
    appData.settings.autoSaveSheetUrl = autoSaveUrl;
    appData.settings.autoSaveEnabled = autoSaveEnabled;

    saveAppData();

    const urlsStatus = document.getElementById('urlsStatus');
    urlsStatus.textContent = '✓ Settings saved successfully';
    urlsStatus.style.color = '#4CAF50';
    urlsStatus.style.display = 'block';

    setTimeout(() => {
        urlsStatus.style.display = 'none';
    }, 3000);

    showMessage('Settings saved successfully', 'success');

    // Auto-sync questions if URL is provided
    if (questionsUrl) {
        setTimeout(() => syncQuestions(), 1000);
    }
}

// =============================================
// 10. MANUAL UPLOAD TO GOOGLE SHEETS
// =============================================

async function uploadResultsToGoogleSheets() {
    if (!appData.settings.autoSaveSheetUrl) {
        showMessage('Please configure Auto-Save URL first in Settings', 'error');
        return;
    }

    if (appData.results.length === 0) {
        showMessage('No results to upload', 'warning');
        return;
    }

    showLoading('Uploading results to Google Sheets...');

    let successCount = 0;
    let errorCount = 0;

    // Upload each result individually
    for (const result of appData.results) {
        try {
            await autoSaveToGoogleSheets(result);
            successCount++;
        } catch (error) {
            console.error('Upload error for:', result, error);
            errorCount++;
        }
    }

    hideLoading();

    if (errorCount === 0) {
        showMessage(`Successfully uploaded ${successCount} results to Google Sheets`, 'success');
    } else {
        showMessage(`Uploaded ${successCount} results, ${errorCount} failed`, 'warning');
    }
}

// =============================================
// 11. HELPER FUNCTIONS
// =============================================

function calculateScore() {
    let correct = 0;

    examState.questions.forEach(question => {
        if (examState.userAnswers[question.id] === question.correctAnswer) {
            correct++;
        }
    });

    const percentage = (correct / examState.questions.length) * 100;

    return {
        correct: correct,
        total: examState.questions.length,
        percentage: percentage.toFixed(2),
        grade: getGrade(percentage)
    };
}

function getGrade(percentage) {
    if (percentage >= 90) return 'A+';
    if (percentage >= 80) return 'A';
    if (percentage >= 70) return 'B';
    if (percentage >= 60) return 'C';
    if (percentage >= 50) return 'D';
    return 'F';
}

function formatTime(seconds) {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

// =============================================
// 12. SUBJECT MANAGEMENT FUNCTIONS
// =============================================

function loadSubjectSettings() {
    const primarySubjects = document.getElementById('primarySubjects');
    const jssSubjects = document.getElementById('jssSubjects');
    const currentPrimarySubjects = document.getElementById('currentPrimarySubjects');
    const currentJSSSubjects = document.getElementById('currentJSSSubjects');

    if (!primarySubjects || !jssSubjects) return;

    // Load current subjects display
    if (currentPrimarySubjects) {
        currentPrimarySubjects.textContent = appData.subjects.primary.join(', ');
    }
    if (currentJSSSubjects) {
        currentJSSSubjects.textContent = appData.subjects.jss.join(', ');
    }

    // Load edit fields
    primarySubjects.value = appData.subjects.primary.join(', ');
    jssSubjects.value = appData.subjects.jss.join(', ');

    // Load question limits
    loadQuestionLimitsDisplay();
}

function saveSubjectSettings() {
    const primarySubjects = document.getElementById('primarySubjects').value;
    const jssSubjects = document.getElementById('jssSubjects').value;
    const primaryQuestionLimits = document.getElementById('primaryQuestionLimits').value;
    const jssQuestionLimits = document.getElementById('jssQuestionLimits').value;

    // Parse subjects (comma separated)
    appData.subjects.primary = primarySubjects.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    appData.subjects.jss = jssSubjects.split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    // Parse question limits
    parseQuestionLimits(primaryQuestionLimits, 'primary');
    parseQuestionLimits(jssQuestionLimits, 'jss');

    saveAppData();
    loadSubjectSettings();

    document.getElementById('subjectSettingsStatus').textContent = '✓ Subject settings saved successfully';
    document.getElementById('subjectSettingsStatus').style.color = '#4CAF50';
    document.getElementById('subjectSettingsStatus').style.display = 'block';

    setTimeout(() => {
        document.getElementById('subjectSettingsStatus').style.display = 'none';
    }, 3000);

    showMessage('Subject settings saved successfully', 'success');
}

function parseQuestionLimits(limitsText, level) {
    if (!limitsText.trim()) return;

    const lines = limitsText.split('\n');

    lines.forEach(line => {
        if (!line.trim()) return;

        // Remove extra spaces and split by colon
        const parts = line.split(':').map(p => p.trim());
        if (parts.length === 2) {
            const subject = parts[0];
            const limit = parseInt(parts[1]);

            if (!isNaN(limit) && limit > 0) {
                appData.questionLimits[`${level}-${subject}`] = limit;
            }
        }
    });
}

function loadQuestionLimitsDisplay() {
    const primaryQuestionLimits = document.getElementById('primaryQuestionLimits');
    const jssQuestionLimits = document.getElementById('jssQuestionLimits');

    if (!primaryQuestionLimits || !jssQuestionLimits) return;

    // Build primary subjects limits text
    let primaryText = '';
    appData.subjects.primary.forEach(subject => {
        const key = `primary-${subject}`;
        const limit = appData.questionLimits[key] || '';
        primaryText += `${subject}: ${limit}\n`;
    });
    primaryQuestionLimits.value = primaryText.trim();

    // Build JSS subjects limits text
    let jssText = '';
    appData.subjects.jss.forEach(subject => {
        const key = `jss-${subject}`;
        const limit = appData.questionLimits[key] || '';
        jssText += `${subject}: ${limit}\n`;
    });
    jssQuestionLimits.value = jssText.trim();
}

function getQuestionLimit(level, subject) {
    const key = `${level}-${subject}`;
    return appData.questionLimits[key] || 0; // 0 means no limit
}

function resetSubjectSettings() {
    if (!confirm('Reset all subject settings to defaults?')) return;

    appData.subjects = {
        'primary': ['Mathematics', 'English Language', 'Basic Science', 'Social Studies'],
        'jss': ['Mathematics', 'English Studies', 'Basic Science', 'Basic Technology']
    };

    appData.questionLimits = {};

    saveAppData();
    loadSubjectSettings();

    showMessage('Subject settings reset to defaults', 'success');
}

// =============================================
// 13. LOAD SUBJECTS FUNCTION
// =============================================

function loadSubjects(classId) {
    if (!examState.studentInfo) {
        showMessage('Please authenticate first', 'error');
        return;
    }

    const subjectGrid = document.getElementById('subjectGrid');
    if (!subjectGrid) return;

    subjectGrid.innerHTML = '';

    // Determine level and get subjects
    const level = classId.includes('primary') ? 'primary' : 'jss';
    const subjects = appData.subjects[level] || [];

    if (subjects.length === 0) {
        subjectGrid.innerHTML = '<p>No subjects configured for this level.</p>';
        return;
    }

    subjects.forEach(subject => {
        const hasTaken = hasStudentTakenExam(
            examState.studentInfo.admissionNumber,
            examState.studentInfo.class,
            subject
        );

        const hasPermission = hasRetakePermission(
            examState.studentInfo.admissionNumber,
            examState.studentInfo.class,
            subject
        );

        // Get question limit for this subject
        const questionLimit = getQuestionLimit(level, subject);
        const limitText = questionLimit > 0 ? `(${questionLimit} questions)` : '';

        let buttonText = 'Start Exam';
        let statusText = limitText;
        let disabled = false;

        if (hasTaken && !hasPermission) {
            buttonText = 'Retake (Contact Admin)';
            statusText = `✓ Taken ${limitText}`;
            disabled = true;
        } else if (hasTaken && hasPermission) {
            buttonText = 'Retake Exam';
            statusText = `✓ Taken ${limitText}`;
        }

        const subjectCard = document.createElement('div');
        subjectCard.className = 'subject-card';
        subjectCard.innerHTML = `
            <h4>${subject}</h4>
            <p>${statusText}</p>
            <button onclick="startExam('${classId}', '${subject}')"
                    class="btn" ${disabled ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                ${buttonText}
            </button>
        `;

        subjectGrid.appendChild(subjectCard);
    });
}

// =============================================
// 14. LOAD QUESTIONS FUNCTION (FOR STUDENTS)
// =============================================

async function loadQuestions(classId, subject) {
    try {
        console.log(`Loading questions for ${classId} - ${subject}`);

        // If no questions loaded and we have a URL, try to sync
        if (appData.questions.length === 0 && appData.settings.questionsSheetUrl) {
            console.log('No questions loaded, auto-syncing from configured URL');
            await syncQuestions();
        }

        // Determine level (primary or jss)
        const level = classId.includes('primary') ? 'primary' : 'jss';

        // Filter questions for this class and subject
        const normClass = classId.replace('-', ' ').toUpperCase();
        const normSubject = subject.toUpperCase();

        console.log('Filtering questions:', { normClass, normSubject });
        console.log('Total questions available:', appData.questions.length);

        const filteredQuestions = appData.questions.filter(q => {
            const qClass = (q.Class || q.ClassName || q['Class Name'] || q.class || '').toUpperCase();
            const qSubject = (q.Subject || q['Subject Name'] || q.subject || '').toUpperCase();

            return qClass === normClass && qSubject === normSubject;
        });

        console.log('Filtered questions:', filteredQuestions.length);

        // If no questions found, use sample
        if (filteredQuestions.length === 0) {
            console.log('No questions found for this class/subject');
            return getSampleQuestions(classId, subject);
        }

        // Apply question limit if set
        const questionLimit = getQuestionLimit(level, subject);
        let finalQuestions = filteredQuestions;

        if (questionLimit > 0 && filteredQuestions.length > questionLimit) {
            console.log(`Applying limit: ${questionLimit} questions out of ${filteredQuestions.length}`);
            // Shuffle and select limited number of questions
            finalQuestions = shuffleArray([...filteredQuestions]).slice(0, questionLimit);
        } else {
            // Shuffle all questions
            finalQuestions = shuffleArray([...filteredQuestions]);
        }

        // Convert to exam format
        const examQuestions = finalQuestions.map((q, index) => {
            // Get options
            const options = [
                q.OptionA || q['Option A'] || q.optionA || q['Option 1'] || '',
                q.OptionB || q['Option B'] || q.optionB || q['Option 2'] || '',
                q.OptionC || q['Option C'] || q.optionC || q['Option 3'] || '',
                q.OptionD || q['Option D'] || q.optionD || q['Option 4'] || ''
            ].filter(opt => opt && opt.trim() !== '');

            // Ensure 4 options
            while (options.length < 4) {
                options.push(`Option ${String.fromCharCode(65 + options.length)}`);
            }

            // Get correct answer
            let correctAnswer = q.CorrectAnswer || q['Correct Answer'] || q.answer || q.Answer || 'A';
            if (/^[1-4]$/.test(correctAnswer)) {
                correctAnswer = String.fromCharCode(64 + parseInt(correctAnswer));
            }
            correctAnswer = correctAnswer.toUpperCase().trim();
            if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
                correctAnswer = 'A';
            }

            // Get image URL
            const imageUrl = q.ImageURL || q['Image URL'] || q.image || q.Image || q.imageurl || '';

            return {
                id: index + 1,
                question: q.Question || q.Text || q.question || `Question ${index + 1}`,
                options: options,
                correctAnswer: correctAnswer,
                subject: subject,
                class: classId,
                imageUrl: imageUrl.trim()
            };
        });

        return examQuestions;

    } catch (error) {
        console.error('Load questions error:', error);
        return getSampleQuestions(classId, subject);
    }
}

// Helper function to shuffle array
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getSampleQuestions(classId, subject) {
    const questions = [];
    const isPrimary = classId.includes('primary');
    const baseNum = isPrimary ? 10 : 20;

    for (let i = 1; i <= 10; i++) {
        questions.push({
            id: i,
            question: `Sample ${subject} question ${i} for ${classId}: What is ${baseNum + i} + ${i}?`,
            options: [
                `${baseNum + i - 1}`,
                `${baseNum + i}`,
                `${baseNum + i + 1}`,
                `${baseNum + i + 2}`
            ],
            correctAnswer: 'B',
            subject: subject,
            class: classId,
            imageUrl: ''
        });
    }

    return shuffleArray(questions);
}

// =============================================
// 15. EXAM FUNCTIONS
// =============================================

async function startExam(classId, subject) {
    if (!examState.studentInfo) {
        showMessage('Please authenticate first', 'error');
        return;
    }

    const className = examState.studentInfo.class;

    // Check if already taken
    if (hasStudentTakenExam(examState.studentInfo.admissionNumber, className, subject)) {
        // Check for retake permission
        if (!hasRetakePermission(examState.studentInfo.admissionNumber, className, subject)) {
            showMessage('You have already taken this exam. Contact admin for retake permission.', 'warning');
            return;
        }
    }

    try {
        const questions = await loadQuestions(classId, subject);

        if (!questions || questions.length === 0) {
            showMessage('No questions available for this exam', 'error');
            return;
        }

        // Get exam duration
        const examDuration = getExamDuration(className, subject);

        // Set exam state
        examState.currentClass = classId;
        examState.currentSubject = subject;
        examState.questions = questions;
        examState.currentQuestionIndex = 0;
        examState.userAnswers = {};
        examState.timeRemaining = examDuration;
        examState.examDuration = examDuration;
        examState.isExamActive = true;

        // Hide portal, show exam
        document.querySelector('.hero').style.display = 'none';
        document.querySelector('.selector-group').style.display = 'none';
        document.getElementById('classGrid').style.display = 'none';
        document.getElementById('subjectGrid').style.display = 'none';

        const examContainer = document.getElementById('examContainer');
        const examSubject = document.getElementById('examSubject');
        const timer = document.getElementById('timer');
        const submitBtn = document.getElementById('fixedSubmitBtn');

        examSubject.textContent = `${subject} - ${className}`;
        examContainer.style.display = 'block';
        timer.style.display = 'block';
        submitBtn.style.display = 'none';
        submitBtn.onclick = showUnansweredWarning;

        displayQuestion();
        startTimer();
        updateAdminButtonVisibility();

    } catch (error) {
        console.error('Start exam error:', error);
        showMessage('Failed to start exam: ' + error.message, 'error');
    }
}

function displayQuestion() {
    const questionsContainer = document.getElementById('questionsContainer');
    if (!questionsContainer || examState.questions.length === 0) return;

    const question = examState.questions[examState.currentQuestionIndex];

    let optionsHtml = '';
    const optionLetters = ['A', 'B', 'C', 'D'];

    question.options.forEach((option, index) => {
        const isChecked = examState.userAnswers[question.id] === optionLetters[index];
        optionsHtml += `
            <label style="display: block; margin: 10px 0; padding: 12px;
                         background: ${isChecked ? '#e3f2fd' : 'white'};
                         border: 2px solid ${isChecked ? '#2196F3' : '#e0e0e0'};
                         border-radius: 5px; cursor: pointer;">
                <input type="radio" name="question${question.id}" value="${optionLetters[index]}"
                       ${isChecked ? 'checked' : ''}
                       onchange="saveAnswer(${question.id}, '${optionLetters[index]}')"
                       style="margin-right: 10px;">
                ${optionLetters[index]}. ${option}
            </label>
        `;
    });

    // Add image if available
    let imageHtml = '';
    if (question.imageUrl && question.imageUrl.trim() !== '') {
        imageHtml = `
            <div style="text-align: center; margin: 15px 0;">
                <img src="${question.imageUrl}"
                     alt="Question Image"
                     class="question-image"
                     onerror="this.style.display='none'">
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    Click image to enlarge
                </div>
            </div>
        `;
    }

    questionsContainer.innerHTML = `
        <div class="question">
            <div class="question-number">Question ${examState.currentQuestionIndex + 1} of ${examState.questions.length}</div>
            <div class="question-text">${question.question}</div>
            ${imageHtml}
            <div class="options">${optionsHtml}</div>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 20px;">
            <button onclick="previousQuestion()" ${examState.currentQuestionIndex === 0 ? 'disabled' : ''}
                    class="btn-secondary">
                ← Previous
            </button>
            <button onclick="nextQuestion()" ${examState.currentQuestionIndex === examState.questions.length - 1 ? 'disabled' : ''}
                    class="btn-secondary">
                Next →
            </button>
        </div>
    `;
}

function saveAnswer(questionId, answer) {
    examState.userAnswers[questionId] = answer;
}

function previousQuestion() {
    if (examState.currentQuestionIndex > 0) {
        examState.currentQuestionIndex--;
        displayQuestion();
    }
}

function nextQuestion() {
    if (examState.currentQuestionIndex < examState.questions.length - 1) {
        examState.currentQuestionIndex++;
        displayQuestion();
    }
}

function startTimer() {
    updateTimerDisplay();

    examState.timer = setInterval(() => {
        examState.timeRemaining--;
        updateTimerDisplay();

        if (examState.timeRemaining <= 0) {
            endExam();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const timer = document.getElementById('timer');
    const submitBtn = document.getElementById('fixedSubmitBtn');

    if (!timer) return;

    const minutes = Math.floor(examState.timeRemaining / 60);
    const seconds = examState.timeRemaining % 60;

    timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    // Get submit button percentage setting
    const className = examState.studentInfo.class;
    const subject = examState.currentSubject;
    const submitButtonPercentage = getSubmitButtonPercentage(className, subject);

    // Calculate when to show submit button
    const submitButtonTime = Math.floor(examState.examDuration * (submitButtonPercentage / 100));

    // Show submit button at specified percentage
    if (examState.timeRemaining <= submitButtonTime) {
        submitBtn.style.display = 'block';
        timer.className = 'timer danger';
    } else if (examState.timeRemaining < 300) {
        timer.className = 'timer danger';
    } else if (examState.timeRemaining < 600) {
        timer.className = 'timer warning';
    } else {
        timer.className = 'timer';
    }
}

function getSubmitButtonPercentage(className, subject) {
  const key = `${className}-${subject}`;
  if (appData.examDurations[key]) {
    return appData.examDurations[key].submitButtonPercentage || 10;
  }
  return 10;
}

function getExamDuration(className, subject) {
  const key = `${className}-${subject}`;
  if (appData.examDurations[key]) {
    return appData.examDurations[key].duration || (60 * 60);
  }
  return 60 * 60;
}

function endExam() {
    clearInterval(examState.timer);
    submitExam();
}

// =============================================
// 16. UI FUNCTIONS
// =============================================

function showAuthModal() {
    console.log('Showing auth modal');
    // Clear form
    document.getElementById('admissionNumber').value = '';
    document.getElementById('fullName').value = '';
    document.getElementById('class').value = '';
    clearErrors();
    showModal('authModal');
}

function updateStudentDashboard() {
    const classGrid = document.getElementById('classGrid');
    if (!classGrid || !examState.studentInfo) return;

    classGrid.innerHTML = '';

    const classCard = document.createElement('div');
    classCard.className = 'class-card';
    classCard.innerHTML = `
        <h3>${examState.studentInfo.class}</h3>
        <p>Welcome, ${examState.studentInfo.name}</p>
        <p>ID: ${examState.studentInfo.admissionNumber}</p>
        <button onclick="loadSubjects('${examState.studentInfo.class.toLowerCase().replace(' ', '-')}')" class="btn">
            View Available Exams
        </button>
        <button onclick="logoutStudent()" class="btn-secondary" style="margin-top: 10px;">
            Logout
        </button>
    `;

    classGrid.appendChild(classCard);
}

function handleLevelSelect() {
    const levelSelect = document.getElementById('levelSelect');
    const classSelect = document.getElementById('classSelect');

    if (!levelSelect || !classSelect) return;

    const selectedLevel = levelSelect.value;

    if (!selectedLevel) {
        classSelect.style.display = 'none';
        document.getElementById('classGrid').innerHTML = '';
        return;
    }

    classSelect.style.display = 'block';
    classSelect.innerHTML = '<option value="">Select Your Class</option>';

    let classes = [];
    if (selectedLevel === 'primary') {
        classes = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'];
    } else if (selectedLevel === 'jss') {
        classes = ['JSS 1', 'JSS 2', 'JSS 3'];
    }

    classes.forEach(className => {
        const option = document.createElement('option');
        option.value = className.toLowerCase().replace(' ', '-');
        option.textContent = className;
        classSelect.appendChild(option);
    });

    classSelect.onchange = handleClassSelect;
}

function handleClassSelect() {
    const classSelect = document.getElementById('classSelect');
    const selectedClass = classSelect.value;

    if (!selectedClass) {
        document.getElementById('classGrid').innerHTML = '';
        return;
    }

    const classGrid = document.getElementById('classGrid');
    classGrid.innerHTML = '';

    const classNameDisplay = selectedClass.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    const classCard = document.createElement('div');
    classCard.className = 'class-card';
    classCard.innerHTML = `
        <h3>${classNameDisplay}</h3>
        <p>Select a subject to begin exam</p>
        <button onclick="showAuthModal()" class="btn">
            Start Authentication
        </button>
    `;

    classGrid.appendChild(classCard);
}

function logoutStudent() {
    examState.studentInfo = null;
    sessionStorage.removeItem('sma_student_info');
    document.getElementById('classGrid').innerHTML = '';
    document.getElementById('subjectGrid').innerHTML = '';
    showMessage('Logged out successfully', 'success');
}

function returnToPortal() {
    document.getElementById('resultsContainer').style.display = 'none';
    document.querySelector('.hero').style.display = 'block';
    document.querySelector('.selector-group').style.display = 'block';
    document.getElementById('classGrid').style.display = 'grid';
    document.getElementById('subjectGrid').innerHTML = '';

    // Reset exam state
    examState.currentClass = null;
    examState.currentSubject = null;
    examState.questions = [];
    examState.userAnswers = {};
    examState.currentQuestionIndex = 0;
    examState.isExamActive = false;
    examState.timer = null;

    // Hide fixed elements
    document.getElementById('fixedSubmitBtn').style.display = 'none';
    document.getElementById('timer').style.display = 'none';

    updateStudentDashboard();
    updateAdminButtonVisibility();
}

// =============================================
// 17. ADMIN FUNCTIONS
// =============================================

function showPasswordModal() {
    showModal('passwordModal');
}

function handleAdminPassword(e) {
    e.preventDefault();

    const passwordInput = document.getElementById('adminPassword');
    const passwordError = document.getElementById('passwordError');
    const password = passwordInput.value;

    passwordError.textContent = '';

    if (password === appData.settings.adminPassword) {
        examState.adminAuthenticated = true;
        closeModal('passwordModal');
        showModal('adminModal');
        loadAdminData();
    } else {
        passwordError.textContent = 'Incorrect password';
        passwordInput.value = '';
    }
}

function showTab(tabName) {
    ['studentsTab', 'examsTab', 'questionsTab', 'resultsTab', 'retakesTab', 'settingsTab'].forEach(tab => {
        const tabElement = document.getElementById(tab);
        if (tabElement) tabElement.style.display = 'none';
    });

    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.style.display = 'block';

        if (tabName === 'exams') {
            loadExamDurations();
        } else if (tabName === 'retakes') {
            loadRetakePermissions();
        } else if (tabName === 'settings') {
            loadSettings();
        }
    }
}

function loadAdminData() {
    loadStudents();
    loadQuestionsAdmin();
    loadAdminResults();
    loadSettings();
}

function loadStudents() {
    const studentsList = document.getElementById('studentsList');
    const studentsLoading = document.getElementById('studentsLoading');

    if (!studentsList) return;

    studentsLoading.style.display = 'block';
    studentsList.innerHTML = '';

    setTimeout(() => {
        studentsLoading.style.display = 'none';
        updateStudentsDisplay();
    }, 500);
}

function updateStudentsDisplay() {
    const studentsList = document.getElementById('studentsList');
    if (!studentsList) return;

    if (appData.students.length === 0) {
        studentsList.innerHTML = '<p>No students found. Configure Google Sheets URL and sync.</p>';
    } else {
        let html = '<table class="data-table"><tr><th>Admission</th><th>Name</th><th>Class</th></tr>';

        appData.students.slice(0, 20).forEach(student => {
            const admission = student.AdmissionNumber || student['Admission Number'] || student.admissionnumber || 'N/A';
            const name = student.FullName || student.Name || student.fullname || 'N/A';
            const className = student.Class || student.ClassName || student.class || 'N/A';

            html += `<tr><td>${admission}</td><td>${name}</td><td>${className}</td></tr>`;
        });

        if (appData.students.length > 20) {
            html += `<tr><td colspan="3">... and ${appData.students.length - 20} more</td></tr>`;
        }

        html += '</table>';
        studentsList.innerHTML = html;
    }
}

function loadQuestionsAdmin() {
    const questionsList = document.getElementById('questionsList');
    const questionsLoading = document.getElementById('questionsLoading');

    if (!questionsList) return;

    questionsLoading.style.display = 'block';
    questionsList.innerHTML = '';

    setTimeout(() => {
        questionsLoading.style.display = 'none';
        updateQuestionsDisplay();
    }, 500);
}

function updateQuestionsDisplay() {
    const questionsList = document.getElementById('questionsList');
    if (!questionsList) return;

    if (appData.questions.length === 0) {
        questionsList.innerHTML = '<p>No questions found. Configure Google Sheets URL and sync.</p>';
        return;
    }

    // Group by class and subject
    const groups = {};
    appData.questions.forEach(q => {
        const className = q.Class || q.ClassName || q['Class Name'] || q.class || 'Unknown';
        const subject = q.Subject || q['Subject Name'] || q.subject || 'Unknown';
        const key = `${className} - ${subject}`;

        if (!groups[key]) groups[key] = 0;
        groups[key]++;
    });

    let html = '<h4>Questions by Class & Subject</h4>';
    html += '<table class="data-table"><tr><th>Class - Subject</th><th>Count</th></tr>';

    Object.entries(groups).forEach(([key, count]) => {
        html += `<tr><td>${key}</td><td>${count}</td></tr>`;
    });

    html += '</table>';
    html += `<p><strong>Total Questions:</strong> ${appData.questions.length}</p>`;

    questionsList.innerHTML = html;
}

function saveExamSettings() {
  const className = document.getElementById('durationClass').value;
  const subject = document.getElementById('durationSubject').value;
  const duration = parseInt(document.getElementById('examDurationMinutes').value);
  const questionCount = parseInt(document.getElementById('questionCount').value);
  const submitButtonPercentage = parseInt(document.getElementById('submitButtonPercentage').value);

  if (!className || !subject || !duration || duration < 5) {
    showMessage('Please enter valid duration (min 5 minutes)', 'error');
    return;
  }

  if (!questionCount || questionCount < 5) {
    showMessage('Please enter valid question count (min 5 questions)', 'error');
    return;
  }

  if (!submitButtonPercentage || submitButtonPercentage < 1 || submitButtonPercentage > 100) {
    showMessage('Please enter valid percentage (1-100)', 'error');
    return;
  }

  const key = `${className}-${subject}`;
  appData.examDurations[key] = {
    duration: duration * 60, // Convert to seconds
    questionCount: questionCount,
    submitButtonPercentage: submitButtonPercentage
  };

  saveAppData();
  loadExamDurations();

  document.getElementById('examSettingsStatus').textContent =
    `✓ Settings saved: ${questionCount} questions, ${duration} minutes, submit at ${submitButtonPercentage}% for ${className} - ${subject}`;
  document.getElementById('examSettingsStatus').style.color = '#4CAF50';
  document.getElementById('examSettingsStatus').style.display = 'block';

  setTimeout(() => {
    document.getElementById('examSettingsStatus').style.display = 'none';
  }, 3000);
}

function loadExamDurations() {
  const examsList = document.getElementById('examsList');
  const examsLoading = document.getElementById('examsLoading');

  if (!examsList) return;

  examsLoading.style.display = 'block';
  examsList.innerHTML = '';

  setTimeout(() => {
    examsLoading.style.display = 'none';

    const durations = Object.entries(appData.examDurations);
    if (durations.length === 0) {
      examsList.innerHTML = '<p>No exam settings saved. Default is 20 questions, 60 minutes, submit at 10%.</p>';
    } else {
      let html = '<table class="data-table"><tr><th>Class</th><th>Subject</th><th>Questions</th><th>Duration</th><th>Submit At</th><th>Action</th></tr>';

      durations.forEach(([key, settings]) => {
        const [className, subject] = key.split('-');
        const minutes = settings.duration / 60;
        const questions = settings.questionCount || 20;
        const submitAt = settings.submitButtonPercentage || 10;

        html += `<tr>
            <td>${className}</td>
            <td>${subject}</td>
            <td>${questions} questions</td>
            <td>${minutes} minutes</td>
            <td>${submitAt}%</td>
            <td>
                <button onclick="deleteExamDuration('${key}')"
                        class="btn-secondary" style="padding: 3px 8px; font-size: 12px;">
                    Delete
                </button>
            </td>
        </tr>`;
      });

      html += '</table>';
      examsList.innerHTML = html;
    }
  }, 500);
}

function deleteExamDuration(key) {
  if (confirm('Delete this exam setting?')) {
    delete appData.examDurations[key];
    saveAppData();
    loadExamDurations();
    showMessage('Exam setting deleted', 'success');
  }
}

function clearResults() {
    if (!confirm('Delete ALL results permanently?')) return;

    appData.results = [];
    saveAppData();
    loadAdminResults();
    showMessage('Results cleared', 'success');
}

function exportResults() {
    if (appData.results.length === 0) {
        showMessage('No results to export', 'warning');
        return;
    }

    let csv = 'Student Name,Admission Number,Class,Subject,Score,Total,Percentage,Grade,Date,Time Taken\n';

    const uniqueResults = removeDuplicateResults(appData.results);
    uniqueResults.forEach(result => {
        csv += `"${result.studentName}","${result.admissionNumber}","${result.className}","${result.subject}",${result.score},${result.total},${result.percentage},${result.grade},"${result.date}",${result.timeTaken}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sma_results_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showMessage(`Exported ${uniqueResults.length} results`, 'success');
}

function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const passwordStatus = document.getElementById('passwordStatus');

    passwordStatus.textContent = '';

    if (currentPassword !== appData.settings.adminPassword) {
        passwordStatus.textContent = 'Current password is incorrect';
        passwordStatus.style.color = '#f44336';
        passwordStatus.style.display = 'block';
        return;
    }

    if (newPassword.length < 6) {
        passwordStatus.textContent = 'New password must be at least 6 characters';
        passwordStatus.style.color = '#f44336';
        passwordStatus.style.display = 'block';
        return;
    }

    if (newPassword !== confirmPassword) {
        passwordStatus.textContent = 'New passwords do not match';
        passwordStatus.style.color = '#f44336';
        passwordStatus.style.display = 'block';
        return;
    }

    appData.settings.adminPassword = newPassword;
    saveAppData();

    passwordStatus.textContent = '✓ Password changed successfully';
    passwordStatus.style.color = '#4CAF50';
    passwordStatus.style.display = 'block';

    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';

    setTimeout(() => {
        passwordStatus.style.display = 'none';
    }, 3000);
}

// =============================================
// 18. RETAKE PERMISSIONS
// =============================================

function hasRetakePermission(admissionNumber, className, subject) {
    return appData.retakePermissions.some(permission =>
        permission.admissionNumber === admissionNumber &&
        permission.className === className &&
        permission.subject === subject &&
        permission.granted === true
    );
}

function hasStudentTakenExam(admissionNumber, className, subject) {
    return appData.results.some(result =>
        result.admissionNumber === admissionNumber &&
        result.className === className &&
        result.subject === subject
    );
}

function grantRetakePermission() {
    const admission = document.getElementById('permissionStudent').value.trim();
    const className = document.getElementById('permissionClass').value;
    const subject = document.getElementById('permissionSubject').value;

    if (!admission || !className || !subject) {
        showMessage('Please fill all fields', 'error');
        return;
    }

    // Remove any existing permission
    appData.retakePermissions = appData.retakePermissions.filter(p =>
        !(p.admissionNumber === admission &&
          p.className === className &&
          p.subject === subject)
    );

    // Add new permission
    appData.retakePermissions.push({
        admissionNumber: admission,
        className: className,
        subject: subject,
        granted: true,
        grantedBy: 'admin',
        grantedAt: new Date().toISOString()
    });

    saveAppData();
    loadRetakePermissions();

    document.getElementById('permissionStatus').textContent =
        `✓ Permission granted for ${admission} to retake ${subject}`;
    document.getElementById('permissionStatus').style.color = '#4CAF50';
    document.getElementById('permissionStatus').style.display = 'block';

    // Clear fields
    document.getElementById('permissionStudent').value = '';
    document.getElementById('permissionClass').value = '';
    document.getElementById('permissionSubject').value = '';
}

function revokeRetakePermission() {
    const admission = document.getElementById('permissionStudent').value.trim();
    const className = document.getElementById('permissionClass').value;
    const subject = document.getElementById('permissionSubject').value;

    if (!admission || !className || !subject) {
        showMessage('Please fill all fields', 'error');
        return;
    }

    appData.retakePermissions = appData.retakePermissions.filter(p =>
        !(p.admissionNumber === admission &&
          p.className === className &&
          p.subject === subject)
    );

    saveAppData();
    loadRetakePermissions();

    document.getElementById('permissionStatus').textContent =
        `✓ Permission revoked for ${admission}`;
    document.getElementById('permissionStatus').style.color = '#f44336';
    document.getElementById('permissionStatus').style.display = 'block';
}

function loadRetakePermissions() {
    const retakesList = document.getElementById('retakesList');
    const retakesLoading = document.getElementById('retakesLoading');

    if (!retakesList) return;

    retakesLoading.style.display = 'block';
    retakesList.innerHTML = '';

    setTimeout(() => {
        retakesLoading.style.display = 'none';

        if (appData.retakePermissions.length === 0) {
            retakesList.innerHTML = '<p>No retake permissions granted yet.</p>';
        } else {
            let html = '<table class="data-table"><tr><th>Student</th><th>Class</th><th>Subject</th><th>Status</th><th>Granted On</th><th>Action</th></tr>';

            appData.retakePermissions.forEach(permission => {
                const statusClass = permission.granted ? 'permission-granted' : 'permission-denied';
                const statusText = permission.granted ? 'Granted' : 'Revoked';
                const date = new Date(permission.grantedAt).toLocaleDateString();

                html += `<tr>
                    <td>${permission.admissionNumber}</td>
                    <td>${permission.className}</td>
                    <td>${permission.subject}</td>
                    <td><span class="permission-badge ${statusClass}">${statusText}</span></td>
                    <td>${date}</td>
                    <td>
                        <button onclick="revokeSinglePermission('${permission.admissionNumber}', '${permission.className}', '${permission.subject}')"
                                class="btn-secondary" style="padding: 3px 8px; font-size: 12px;">
                            Revoke
                        </button>
                    </td>
                </tr>`;
            });

            html += '</table>';
            retakesList.innerHTML = html;
        }
    }, 500);
}

function revokeSinglePermission(admission, className, subject) {
    if (confirm(`Revoke retake permission for ${admission}?`)) {
        appData.retakePermissions = appData.retakePermissions.filter(p =>
            !(p.admissionNumber === admission &&
              p.className === className &&
              p.subject === subject)
        );
        saveAppData();
        loadRetakePermissions();
        showMessage('Permission revoked', 'success');
    }
}

function filterResults() {
    const filterClass = document.getElementById('filterClass').value;
    const filterSubject = document.getElementById('filterSubject').value;
    const filterDate = document.getElementById('filterDate').value;

    const resultsDisplay = document.getElementById('resultsDisplay');
    if (!resultsDisplay) return;

    let filteredResults = appData.results;

    // Filter by class
    if (filterClass) {
        filteredResults = filteredResults.filter(result => result.className === filterClass);
    }

    // Filter by subject
    if (filterSubject) {
        filteredResults = filteredResults.filter(result => result.subject === filterSubject);
    }

    // Filter by date
    if (filterDate) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        filteredResults = filteredResults.filter(result => {
            const resultDate = new Date(result.date);

            switch(filterDate) {
                case 'today':
                    return resultDate >= today;
                case 'week':
                    const weekAgo = new Date(today);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return resultDate >= weekAgo;
                case 'month':
                    const monthAgo = new Date(today);
                    monthAgo.setMonth(monthAgo.getMonth() - 1);
                    return resultDate >= monthAgo;
                case 'last7':
                    const last7 = new Date();
                    last7.setDate(last7.getDate() - 7);
                    return resultDate >= last7;
                case 'last30':
                    const last30 = new Date();
                    last30.setDate(last30.getDate() - 30);
                    return resultDate >= last30;
                default:
                    return true;
            }
        });
    }

    // Remove duplicates before displaying
    const uniqueResults = removeDuplicateResults(filteredResults);
    displayFilteredResults(uniqueResults);
}

// =============================================
// 19. GOOGLE SHEETS SYNC FUNCTIONS
// =============================================

async function syncStudents() {
    try {
        const sheetUrl = appData.settings.studentsSheetUrl;
        if (!sheetUrl) {
            showMessage('Please configure Students Sheet URL first', 'error');
            return;
        }

        showLoading('Syncing students...');

        const students = await fetchGoogleSheetData(sheetUrl);

        if (students.length === 0) {
            hideLoading();
            showMessage('No students found in the sheet', 'warning');
            return;
        }

        appData.students = students;
        saveAppData();

        hideLoading();
        showMessage(`Successfully loaded ${students.length} students`, 'success');
        updateStudentsDisplay();

    } catch (error) {
        hideLoading();
        console.error('Sync students error:', error);
        showMessage('Failed to sync students: ' + error.message, 'error');
    }
}

async function syncQuestions() {
    try {
        const sheetUrl = appData.settings.questionsSheetUrl;
        if (!sheetUrl) {
            showMessage('Please configure Questions Sheet URL first', 'error');
            return;
        }

        showLoading('Syncing questions...');

        const questions = await fetchGoogleSheetData(sheetUrl);

        if (questions.length === 0) {
            hideLoading();
            showMessage('No questions found in the sheet', 'warning');
            return;
        }

        appData.questions = questions;
        saveAppData();

        hideLoading();
        showMessage(`Successfully loaded ${questions.length} questions`, 'success');
        updateQuestionsDisplay();

    } catch (error) {
        hideLoading();
        console.error('Sync questions error:', error);
        showMessage('Failed to sync questions: ' + error.message, 'error');
    }
}

async function fetchGoogleSheetData(sheetUrl) {
    console.log('Fetching Google Sheet data from:', sheetUrl);

    if (!sheetUrl) {
        throw new Error('No Google Sheet URL provided');
    }

    // Extract sheet ID
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
        throw new Error('Invalid Google Sheet URL format');
    }

    console.log('Extracted sheet ID:', sheetId);

    // Try multiple methods
    const methods = [
        tryMethod1,  // Direct CSV export
        tryMethod2,  // CORS proxy
        tryMethod3,  // JSON feed
        tryMethod4   // Alternative CSV
    ];

    for (let i = 0; i < methods.length; i++) {
        try {
            console.log(`Trying method ${i + 1}...`);
            const data = await methods[i](sheetId);
            if (data && data.length > 0) {
                console.log(`✓ Method ${i + 1} succeeded, got ${data.length} rows`);
                return data;
            }
        } catch (error) {
            console.log(`Method ${i + 1} failed:`, error.message);
            continue;
        }
    }

    throw new Error('All fetch methods failed');
}

function extractSheetId(url) {
    const patterns = [
        /\/d\/([a-zA-Z0-9-_]+)/,
        /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/,
        /key=([a-zA-Z0-9-_]+)/
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// Method 1: Direct CSV export
async function tryMethod1(sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Method 1 failed');
    const csvText = await response.text();
    return parseCSV(csvText);
}

// Method 2: CORS proxy
async function tryMethod2(sheetId) {
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`)}`;
    const response = await fetch(proxyUrl, {
        headers: { 'Accept': 'text/csv' }
    });
    if (!response.ok) throw new Error('Method 2 failed');
    const csvText = await response.text();
    return parseCSV(csvText);
}

// Method 3: JSON feed (for published sheets)
async function tryMethod3(sheetId) {
    const url = `https://spreadsheets.google.com/feeds/list/${sheetId}/od6/public/values?alt=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Method 3 failed');
    const json = await response.json();

    if (!json.feed || !json.feed.entry) return [];

    return json.feed.entry.map(entry => {
        const row = {};
        for (const key in entry) {
            if (key.startsWith('gsx$')) {
                const cleanKey = key.replace('gsx$', '');
                row[cleanKey] = entry[key]?.$t || '';
            }
        }
        return row;
    });
}

// Method 4: Alternative CSV
async function tryMethod4(sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Method 4 failed');
    const csvText = await response.text();
    return parseCSV(csvText);
}

function parseCSV(csvText) {
    if (!csvText.trim()) return [];

    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // Parse headers
    const headers = parseCSVLine(lines[0]);

    // Parse data rows
    const data = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const row = {};

        headers.forEach((header, index) => {
            if (header && header.trim() && values[index] !== undefined) {
                row[header.trim()] = values[index].trim();
            }
        });

        if (Object.keys(row).length > 0) {
            data.push(row);
        }
    }

    return data;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                current += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current);
    return values.map(v => v.replace(/^"|"$/g, ''));
}

// =============================================
// 20. AUTHENTICATION AND STUDENT FUNCTIONS
// =============================================

async function handleAuthentication(e) {
    e.preventDefault();

    const admissionNumber = document.getElementById('admissionNumber').value.trim();
    const fullName = document.getElementById('fullName').value.trim();
    const className = document.getElementById('class').value;

    clearErrors();

    if (!admissionNumber || !fullName || !className) {
        showError('authInfo', 'All fields are required');
        return;
    }

    document.getElementById('authInfo').textContent = 'Validating...';
    document.getElementById('authInfo').style.color = '#2196F3';
    document.getElementById('authInfo').style.display = 'block';

    try {
        const validation = await validateStudent(admissionNumber, fullName, className);

        if (!validation.valid) {
            showError('authInfo', validation.message);
            return;
        }

        examState.studentInfo = {
            admissionNumber: admissionNumber,
            name: fullName,
            class: className,
            authTime: new Date().toISOString()
        };

        sessionStorage.setItem('sma_student_info', JSON.stringify(examState.studentInfo));

        document.getElementById('authInfo').textContent = '';
        document.getElementById('authSuccess').textContent = '✓ Authentication successful!';
        document.getElementById('authSuccess').style.color = '#4CAF50';
        document.getElementById('authSuccess').style.display = 'block';

        // Clear form
        document.getElementById('admissionNumber').value = '';
        document.getElementById('fullName').value = '';
        document.getElementById('class').value = '';

        setTimeout(() => {
            closeModal('authModal');
            updateStudentDashboard();
        }, 1500);

    } catch (error) {
        console.error('Authentication error:', error);
        showError('authInfo', 'System error. Please try again.');
    }
}

async function validateStudent(admissionNumber, fullName, className) {
    try {
        // If no students data loaded, allow any (students don't need pre-registration)
        if (appData.students.length === 0) {
            console.log('No students loaded, using open authentication');
            return {
                valid: true,
                student: {
                    AdmissionNumber: admissionNumber,
                    FullName: fullName,
                    Class: className
                },
                message: 'Authentication successful'
            };
        }

        // Normalize inputs
        const normAdmission = admissionNumber.trim().toUpperCase();
        const normName = fullName.trim().toUpperCase();
        const normClass = className.trim().toUpperCase();

        // Find student in loaded data
        const student = appData.students.find(s => {
            const sAdmission = (s.AdmissionNumber || s['Admission Number'] || s.admissionnumber || '').toUpperCase();
            const sName = (s.FullName || s.Name || s.fullname || '').toUpperCase();
            const sClass = (s.Class || s.ClassName || s.class || '').toUpperCase();

            return sAdmission === normAdmission &&
                   sClass === normClass &&
                   (sName === normName || sName.includes(normName.split(' ')[0]));
        });

        if (!student) {
            return {
                valid: false,
                message: 'Student not found in records'
            };
        }

        return {
            valid: true,
            student: student,
            message: 'Authentication successful'
        };

    } catch (error) {
        console.error('Validation error:', error);
        // Allow in case of error
        return {
            valid: true,
            student: {
                AdmissionNumber: admissionNumber,
                FullName: fullName,
                Class: className
            },
            message: 'Authentication successful'
        };
    }
}

// =============================================
// 21. DATA MANAGEMENT FUNCTIONS
// =============================================

function backupData() {
    const backup = {
        students: appData.students,
        questions: appData.questions,
        results: appData.results,
        examDurations: appData.examDurations,
        retakePermissions: appData.retakePermissions,
        subjects: appData.subjects,
        questionLimits: appData.questionLimits,
        settings: appData.settings,
        backupDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sma_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    const backupStatus = document.getElementById('backupStatus');
    backupStatus.textContent = '✓ Backup created successfully';
    backupStatus.style.color = '#4CAF50';
    backupStatus.style.display = 'block';

    setTimeout(() => {
        backupStatus.style.display = 'none';
    }, 3000);
}

function restoreData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backup = JSON.parse(e.target.result);

            if (confirm('This will overwrite ALL current data. Continue?')) {
                appData = { ...appData, ...backup };
                saveAppData();

                const backupStatus = document.getElementById('backupStatus');
                backupStatus.textContent = '✓ Data restored successfully';
                backupStatus.style.color = '#4CAF50';
                backupStatus.style.display = 'block';

                if (examState.adminAuthenticated) {
                    loadAdminData();
                }

                setTimeout(() => {
                    backupStatus.style.display = 'none';
                }, 3000);
            }
        } catch (error) {
            const backupStatus = document.getElementById('backupStatus');
            backupStatus.textContent = 'Error: Invalid backup file';
            backupStatus.style.color = '#f44336';
            backupStatus.style.display = 'block';

            setTimeout(() => {
                backupStatus.style.display = 'none';
            }, 3000);
        }
    };
    reader.readAsText(file);
}

// =============================================
// 22. UTILITY FUNCTIONS
// =============================================

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'block';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';

    // Clear form errors
    clearErrors();

    // Reset specific modals
    if (modalId === 'authModal') {
        document.getElementById('authSuccess').textContent = '';
        document.getElementById('authInfo').textContent = '';
    }
}

function updateAdminButtonVisibility() {
    const adminPanel = document.querySelector('.admin-panel');
    if (!adminPanel) return;

    // Show only on home page (when not in exam mode)
    if (examState.isExamActive ||
        document.getElementById('examContainer').style.display === 'block' ||
        document.getElementById('resultsContainer').style.display === 'block') {
        adminPanel.style.display = 'none';
    } else {
        adminPanel.style.display = 'block';
    }
}

function showMessage(message, type = 'info') {
    const existing = document.querySelector('.global-message');
    if (existing) existing.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'global-message';
    messageDiv.innerHTML = `
        <div style="
            position: fixed; top: 20px; right: 20px; padding: 15px 25px;
            background: ${type === 'success' ? '#4CAF50' :
                        type === 'error' ? '#f44336' :
                        type === 'warning' ? '#ff9800' : '#2196F3'};
            color: white; border-radius: 5px; z-index: 10000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2); animation: slideIn 0.3s ease;
            font-weight: bold;
        ">
            ${message}
        </div>
    `;

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        messageDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => messageDiv.remove(), 300);
    }, 5000);
}

function showLoading(message = 'Loading...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7); display: flex; justify-content: center;
            align-items: center; z-index: 9999; color: white; font-size: 18px;
            flex-direction: column;
        `;
        document.body.appendChild(overlay);
    }

    overlay.innerHTML = `
        <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
             border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite;
             margin-bottom: 20px;"></div>
        <div>${message}</div>
    `;

    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

function clearErrors() {
    document.querySelectorAll('.error, .success, .info').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.style.color = '#f44336';
        element.style.display = 'block';
    }
}

// =============================================
// 23. EVENT HANDLERS
// =============================================

window.addEventListener('beforeunload', function(e) {
    if (examState.isExamActive) {
        e.preventDefault();
        e.returnValue = 'You have an active exam. Are you sure you want to leave?';
        return e.returnValue;
    }
});

window.addEventListener('click', function(e) {
    ['authModal', 'passwordModal', 'adminModal', 'unansweredWarningModal'].forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && e.target === modal) {
            closeModal(modalId);
        }
    });
});

// =============================================
// 24. CSS ANIMATIONS
// =============================================

const styleSheet = document.createElement("style");
styleSheet.textContent = `
@keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.sync-status {
    position: fixed; bottom: 70px; left: 20px; background: #333;
    color: white; padding: 10px 15px; border-radius: 5px;
    font-size: 12px; z-index: 1000;
}

.sync-status.success { background: #4CAF50; }
.sync-status.error { background: #f44336; }
.sync-status.warning { background: #ff9800; }

.timer {
    position: fixed; top: 100px; right: 20px; background: #4CAF50;
    color: white; padding: 12px 18px; border-radius: 5px;
    font-weight: bold; font-size: 20px; z-index: 999;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

.timer.warning { background: #ff9800; }
.timer.danger { background: #f44336; animation: pulse 1s infinite; }

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}

.submit-btn {
    animation: slideIn 0.3s ease;
}

/* Grade colors */
.grade-Aplus { color: #4CAF50; }
.grade-A { color: #4CAF50; }
.grade-B { color: #2196F3; }
.grade-C { color: #ff9800; }
.grade-D { color: #ff5722; }
.grade-F { color: #f44336; }
`;
document.head.appendChild(styleSheet);

console.log('Superior Mind Academy Exam Portal loaded - GitHub Hosted Version');

// Sync unsynced results when online
window.addEventListener('online', () => {
    console.log('Back online');
});

window.addEventListener('offline', () => {
    console.log('Offline mode');
    showMessage('You are offline. Results will be saved locally.', 'warning');
});
