(() => {
  "use strict";

  const MAX_IMAGE_FILES = 4;
  const MAX_IMAGE_BYTES = 2.4 * 1024 * 1024;
  const MAX_IMAGE_TOTAL = 2.4 * 1024 * 1024;
  const MAX_QUESTIONS = 30;
  const root = document.createElement("div");
  root.id = "educationRoot";
  root.hidden = true;
  root.setAttribute("aria-live", "polite");
  document.body.appendChild(root);
  const appShell = document.querySelector(".app-shell");

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/jpeg,image/png,image/webp";
  picker.multiple = true;
  picker.hidden = true;
  picker.id = "educationImagePicker";
  picker.setAttribute("aria-label", "Choose worksheet images");
  document.body.appendChild(picker);

  const pagePicker = document.createElement("input");
  pagePicker.type = "file";
  pagePicker.accept = "image/jpeg,image/png,image/webp";
  pagePicker.multiple = false;
  pagePicker.hidden = true;
  pagePicker.id = "educationPagePicker";
  pagePicker.setAttribute("aria-label", "Add or replace a worksheet image");
  document.body.appendChild(pagePicker);
  let pagePickerAction = "";
  let pagePickerIndex = -1;

  let requestSequence = 0;
  let timerHandle = null;
  let timerDeadline = null;

  const state = {
    mode: "",
    quiz: null,
    quizToken: "",
    answers: {},
    index: 0,
    results: null,
    images: [],
    extractedQuestions: [],
    originalRequest: "",
    spec: null,
    retryAction: null,
    submitting: false,
    isImage: false
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function makeButton(text, className, handler) {
    const button = el("button", className || "ed-button", text);
    button.type = "button";
    if (typeof handler === "function") button.addEventListener("click", handler);
    return button;
  }

  function showRoot() {
    root.hidden = false;
    document.body.classList.add("education-open");
    if (appShell) {
      appShell.setAttribute("inert", "");
      appShell.setAttribute("aria-hidden", "true");
    }
  }

  function closeEducation() {
    requestSequence++;
    stopRecognition();
    stopQuizTimer();
    timerDeadline = null;
    root.hidden = true;
    document.body.classList.remove("education-open");
    if (appShell) {
      appShell.removeAttribute("inert");
      appShell.removeAttribute("aria-hidden");
    }
    root.replaceChildren();
    picker.value = "";
    pagePicker.value = "";
    pagePickerAction = "";
    pagePickerIndex = -1;
    state.mode = "";
    state.quiz = null;
    state.quizToken = "";
    state.answers = {};
    state.index = 0;
    state.results = null;
    state.images = [];
    state.extractedQuestions = [];
    state.originalRequest = "";
    state.spec = null;
    state.retryAction = null;
    state.submitting = false;
    state.isImage = false;
  }

  function screen(title, subtitle) {
    showRoot();
    root.replaceChildren();
    const shell = el("section", "ed-shell");
    const header = el("header", "ed-header");
    const headingWrap = el("div", "ed-heading");
    headingWrap.append(el("div", "ed-eyebrow", "VEXEL LEARNING TOOLS"));
    headingWrap.append(el("h1", "", title));
    if (subtitle) headingWrap.append(el("p", "", subtitle));
    header.append(headingWrap);
    header.append(makeButton("Close", "ed-close", closeEducation));
    shell.append(header);
    const body = el("main", "ed-main");
    shell.append(body);
    root.append(shell);
    return body;
  }

  function alertNote(parent, message, isError) {
    const note = el("div", isError ? "ed-note ed-note-error" : "ed-note", message);
    note.setAttribute("role", isError ? "alert" : "status");
    parent.append(note);
    return note;
  }

  function showLoading(title, message) {
    const body = screen(title || "Working on your questions", message || "Vexel is processing this request. Your answers will not be submitted until you choose to submit.");
    const panel = el("div", "ed-panel ed-loading-panel");
    const spinner = el("div", "ed-spinner");
    spinner.setAttribute("aria-hidden", "true");
    panel.append(spinner);
    panel.append(el("h2", "", title || "Please wait"));
    panel.append(el("p", "ed-muted", message || "This can take a moment."));
    body.append(panel);
  }

  async function api(action, payload) {
    const response = await fetch("/api/education", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const error = new Error(data?.error?.message || "Vexel could not complete this request. Please try again.");
      error.code = data?.error?.code || "REQUEST_FAILED";
      error.status = response.status;
      error.retryable = Boolean(data?.error?.retryable);
      throw error;
    }
    return data;
  }

  function requestedDurationMinutes(text) {
    const match = String(text || "").match(/\b(\d{1,3})\s*[- ]?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
    if (!match) return 0;
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) return 0;
    const unit = match[2].toLowerCase();
    const minutes = unit.startsWith("hour") || unit.startsWith("hr") ? value * 60
      : unit.startsWith("sec") ? Math.ceil(value / 60) : value;
    return Math.min(180, Math.max(1, minutes));
  }

  function stopQuizTimer() {
    if (timerHandle !== null) window.clearInterval(timerHandle);
    timerHandle = null;
  }

  function updateQuizTimer() {
    if (!timerDeadline || state.mode !== "active" || root.hidden) return;
    const remaining = Math.max(0, timerDeadline - Date.now());
    const label = root.querySelector("#edTimerLabel");
    if (label) {
      const seconds = Math.ceil(remaining / 1000);
      const minutesPart = Math.floor(seconds / 60);
      const secondsPart = seconds % 60;
      label.textContent = "Time left " + String(minutesPart).padStart(2, "0") + ":" + String(secondsPart).padStart(2, "0");
      label.classList.toggle("ed-timer-urgent", remaining <= 60000);
    }
    if (remaining <= 0 && !state.submitting) {
      stopQuizTimer();
      submitTest(true);
    }
  }

  function startQuizTimer() {
    const duration = Number(state.quiz && state.quiz.durationMinutes) || 0;
    if (duration <= 0) return;
    if (!timerDeadline) timerDeadline = Date.now() + duration * 60 * 1000;
    updateQuizTimer();
    if (timerHandle === null && state.mode === "active" && !state.submitting && timerDeadline > Date.now()) {
      timerHandle = window.setInterval(updateQuizTimer, 500);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) updateQuizTimer();
  });
  window.addEventListener("focus", updateQuizTimer);

  function countQuestions(text) {
    const match = String(text || "").match(/\b(\d{1,3})\s*[- ]?\s*(?:questions?|mcqs?|items?)\b/i) ||
      String(text || "").match(/\b(?:create|make|generate)\s+(\d{1,2})\b/i);
    if (!match) return 10;
    return Math.min(MAX_QUESTIONS, Math.max(1, Number(match[1]) || 10));
  }

  function difficultyFromText(text) {
    if (/\b(very hard|extremely difficult|expert|advanced|hard|difficult)\b/i.test(text)) return "Hard";
    if (/\b(easy|beginner|simple)\b/i.test(text)) return "Easy";
    if (/\b(medium|moderate|intermediate)\b/i.test(text)) return "Medium";
    return "Medium";
  }

  function topicFromText(text) {
    return String(text || "")
      .replace(/\b(create|make|generate|give me|start|take|test me|quiz me|quiz|test|mcq|multiple choice|exam|examination|practice|questions?|topic|subject|a|an|the|this|these|on|about|for|please|me|with|and|of|i|want|you|can|could|would|should|like|to|in|from|difficult|hard|easy|medium|moderate|beginner|advanced|expert|very|extremely|difficulty|chapter|notes?|document|file|pdf|content|study|material|worksheet|uploaded|attached|o[- ]?level|a[- ]?level|gcse|igcse|ib|ap|level|grade|class|year|15-question)\b/gi, " ")
      .replace(/\b\d+\s*[- ]?\s*(?:questions?|mcqs?|items?)\b/gi, " ")
      .replace(/\b\d+\b/g, " ")
      .replace(/\s+/g, " ")
      .replace(/^[\s:,.!?-]+|[\s:,.!?-]+$/g, "")
      .trim();
  }

  function levelFromText(text) {
    const value = String(text || "");
    if (/\bo[- ]?level\b/i.test(value)) return "O Level";
    if (/\ba[- ]?level\b/i.test(value)) return "A Level";
    if (/\bigcse\b/i.test(value)) return "IGCSE";
    if (/\bgcse\b/i.test(value)) return "GCSE";
    const grade = value.match(/\b(grade|class|year)\s*[-:]?\s*(\d{1,2})\b/i);
    if (grade) {
      const label = grade[1].charAt(0).toUpperCase() + grade[1].slice(1).toLowerCase();
      return label + " " + Number(grade[2]);
    }
    if (/\bib\b/i.test(value)) return "IB";
    if (/\bap\b/i.test(value)) return "AP";
    return "General";
  }

  function isQuizIntent(text) {
    const value = String(text || "").trim();
    if (!value) return false;
    if (/\b(what is|explain|define|meaning of)\b[\s\S]{0,40}\b(test|quiz|exam|mcq)\b/i.test(value)) return false;
    return /\b(create|make|generate|give me|start|take)\b[\s\S]{0,100}\b(test|quiz|mcq|exam|examination|questions?)\b/i.test(value) ||
      /\b(test me on|quiz me on|quiz me about|test me about|practice exam|practice test)\b/i.test(value) ||
      /\b(quiz me|test me)\b/i.test(value);
  }

  function isImageQuestionIntent(text) {
    const value = String(text || "");
    return /\b(solve|answer|ask me|test me|quiz me|check my answers|extract|read|turn into a test|create|make|generate|quiz|test)\b[\s\S]{0,160}\b(question|worksheet|photo|image|picture|notebook|these|this|them|it|chapter|page|sheet|attached|uploaded)\b/i.test(value) ||
      /\b(questions?|worksheet|chapter|page)\s+from\s+(this|the|an?)\s+(image|photo|picture|worksheet|document|page)\b/i.test(value) ||
      /\b(image|photo|picture|worksheet|document|page)\b[\s\S]{0,90}\b(questions?|quiz|test|solve|answer|ask me|check)\b/i.test(value);
  }

  function renderTopicClarification(request, count, difficulty, sourceText = "", durationMinutes = 0, level = "General") {
    state.mode = "topic";
    state.originalRequest = request;
    const body = screen("Create an interactive test", "One detail is missing. Tell Vexel what subject or topic the test should cover.");
    const panel = el("form", "ed-panel");
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const topic = topicInput.value.trim();
      if (topic.length < 2) {
        topicInput.focus();
        topicError.textContent = "Enter a subject or topic first.";
        return;
      }
      startGeneratedTest({
        request: request,
        sourceText: sourceText,
        topic: topic,
        count: count,
        difficulty: difficulty,
        durationMinutes: durationMinutes,
        level: level
      });
    });
    panel.append(el("label", "ed-label", "Test subject or topic"));
    const topicInput = el("input", "ed-field");
    topicInput.type = "text";
    topicInput.maxLength = 300;
    topicInput.placeholder = "For example, O Level Biology or Python loops";
    topicInput.autocomplete = "off";
    topicInput.required = true;
    panel.append(topicInput);
    panel.append(el("label", "ed-label", "Number of questions"));
    const countSelect = el("select", "ed-field");
    const countOptions = [5, 10, 15, 20, 25, 30];
    if (!countOptions.includes(count)) countOptions.push(count);
    countOptions.sort((a, b) => a - b).forEach((n) => {
      const option = el("option", "", n + " questions");
      option.value = String(n);
      option.selected = n === count;
      countSelect.append(option);
    });
    countSelect.addEventListener("change", () => { count = Number(countSelect.value); });
    panel.append(countSelect);
    panel.append(el("label", "ed-label", "Difficulty"));
    const difficultySelect = el("select", "ed-field");
    ["Easy", "Medium", "Hard"].forEach((name) => {
      const option = el("option", "", name);
      option.value = name;
      option.selected = name === difficulty;
      difficultySelect.append(option);
    });
    difficultySelect.addEventListener("change", () => { difficulty = difficultySelect.value; });
    panel.append(difficultySelect);
    const topicError = el("p", "ed-inline-error");
    topicError.setAttribute("aria-live", "polite");
    panel.append(topicError);
    const actions = el("div", "ed-actions");
    actions.append(makeButton("Cancel", "ed-button ed-button-secondary", closeEducation));
    const submit = el("button", "ed-button ed-button-primary", "Generate test");
    submit.type = "submit";
    actions.append(submit);
    panel.append(actions);
    body.append(panel);
    topicInput.focus();
  }

  function validateClientQuiz(quiz, token, expectedCount) {
    if (!quiz || !Array.isArray(quiz.questions) || !token || quiz.questions.length !== expectedCount) {
      throw new Error("Vexel returned an incomplete test. No examination was started; please retry.");
    }
    const ids = new Set();
    for (const question of quiz.questions) {
      const isMcq = question && question.type === "mcq";
      const validChoices = Array.isArray(question?.choices) &&
        (isMcq
          ? question.choices.length >= 2 && question.choices.every((choice) => choice && choice.id && typeof choice.text === "string" && choice.text.trim())
          : question.type === "short" && question.choices.length === 0);
      if (!question || typeof question.id !== "string" || ids.has(question.id) ||
          typeof question.question !== "string" || !question.question.trim() || !validChoices ||
          !Number.isFinite(Number(question.marks)) || Number(question.marks) <= 0) {
        throw new Error("Vexel returned a malformed question. No examination was started; please retry.");
      }
      ids.add(question.id);
    }
  }

  async function startGeneratedTest(spec) {
    const requestId = ++requestSequence;
    stopQuizTimer();
    timerDeadline = null;
    state.spec = spec;
    state.originalRequest = spec.request || "";
    state.isImage = false;
    state.retryAction = () => startGeneratedTest(spec);
    showLoading("Generating your test", "Creating " + spec.count + " " + spec.difficulty.toLowerCase() + " questions. Correct answers stay hidden until submission.");
    try {
      const data = await api("generate-quiz", spec);
      if (requestId !== requestSequence) return;
      validateClientQuiz(data.quiz, data.quizToken, spec.count);
      state.quiz = data.quiz;
      state.quizToken = data.quizToken;
      state.answers = {};
      state.index = 0;
      state.results = null;
      state.mode = "active";
      timerDeadline = null;
      renderQuestion();
    } catch (error) {
      if (requestId !== requestSequence) return;
      showError("Couldn't generate the test", error.message, () => startGeneratedTest(spec));
    }
  }

  function composerImages() {
    const images = [];
    const previewRoot = document.getElementById("imagePreviews");
    if (!previewRoot) return images;
    previewRoot.querySelectorAll("img").forEach((image) => {
      const url = image.src || "";
      const match = url.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
      if (match) images.push({ mimeType: match[1].toLowerCase(), data: match[2], previewUrl: url });
    });
    return images;
  }

  function clearComposerImages() {
    const previewRoot = document.getElementById("imagePreviews");
    while (previewRoot && previewRoot.querySelector(".remove-thumb")) {
      previewRoot.querySelector(".remove-thumb").click();
    }
  }

  function startImageInput() {
    picker.value = "";
    picker.click();
  }

  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        reject(new Error("Use JPEG, PNG, or WebP images. PDFs are not supported by this beta image solver."));
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        reject(new Error("Each image must be 2.4 MB or smaller. Use a clear, compressed JPEG, PNG, or WebP image."));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Vexel could not read one of those files. Try selecting it again."));
      reader.onload = () => {
        const dataUrl = String(reader.result || "");
        const splitAt = dataUrl.indexOf(",");
        if (splitAt < 0) {
          reject(new Error("Vexel could not read that image. Please choose another file."));
          return;
        }
        resolve({ mimeType: file.type, data: dataUrl.slice(splitAt + 1), previewUrl: dataUrl, size: file.size });
      };
      reader.readAsDataURL(file);
    });
  }

  async function handlePickerChange() {
    const files = Array.from(picker.files || []);
    if (!files.length) return;
    if (files.length > MAX_IMAGE_FILES) {
      showError("Too many images", "Choose no more than four worksheet pages at once.", startImageInput);
      picker.value = "";
      return;
    }
    try {
      const images = await Promise.all(files.map(readImageFile));
      const total = images.reduce((sum, image) => sum + image.size, 0);
      if (total > MAX_IMAGE_TOTAL) throw new Error("The combined image size must be 2.4 MB or less. Upload fewer pages or resize the images first.");
      startImageExtraction(images, "Extract these worksheet questions so I can answer them directly.");
    } catch (error) {
      showError("Image upload failed", error.message, startImageInput);
    } finally {
      picker.value = "";
    }
  }

  function choosePageAction(action, index = -1) {
    const proceed = !state.extractedQuestions.length ||
      window.confirm("Changing worksheet images will re-read the pages and reset any text edits made on this review screen. Continue?");
    if (!proceed) return;
    pagePickerAction = action;
    pagePickerIndex = index;
    pagePicker.multiple = action === "add";
    pagePicker.value = "";
    pagePicker.click();
  }

  async function handlePagePickerChange() {
    const files = Array.from(pagePicker.files || []);
    const action = pagePickerAction;
    const index = pagePickerIndex;
    pagePickerAction = "";
    pagePickerIndex = -1;
    if (!files.length || !action) return;
    try {
      if (action === "replace" && files.length !== 1) {
        throw new Error("Choose exactly one image to replace this page.");
      }
      if (action === "add" && state.images.length + files.length > MAX_IMAGE_FILES) {
        throw new Error("A maximum of four worksheet images is supported.");
      }
      const loaded = await Promise.all(files.map(readImageFile));
      let combined = state.images.slice();
      if (action === "replace") combined[index] = loaded[0];
      else if (action === "remove") combined.splice(index, 1);
      else combined = combined.concat(loaded);
      const total = combined.reduce((sum, image) => sum + (image.size || (image.data.length * 0.75)), 0);
      if (combined.length < 1 || combined.length > MAX_IMAGE_FILES) {
        throw new Error("Keep between one and four worksheet images.");
      }
      if (total > MAX_IMAGE_TOTAL) {
        throw new Error("The combined image size must be 2.4 MB or less. Upload smaller images or fewer pages.");
      }
      await startImageExtraction(combined, state.originalRequest || "Extract these worksheet questions so I can answer them directly.");
    } catch (error) {
      showError("Worksheet image update failed", error.message, renderImageReview);
    } finally {
      pagePicker.value = "";
    }
  }

  async function startImageExtraction(images, request) {
    const requestId = ++requestSequence;
    if (!images || !images.length) {
      showError("No question image found", "Choose a JPEG, PNG, or WebP photo to start the beta image question solver.", startImageInput);
      return;
    }
    state.images = images.map((image) => ({ mimeType: image.mimeType, data: image.data, previewUrl: image.previewUrl }));
    state.originalRequest = request || "Extract these worksheet questions.";
    const total = state.images.reduce((sum, image) => sum + (image.data || "").length * 0.75, 0);
    if (images.length > MAX_IMAGE_FILES || total > MAX_IMAGE_TOTAL) {
      showError("Images are too large", "Upload up to four images with a combined size of 2.4 MB or less. Choose smaller files to continue.", startImageInput);
      return;
    }
    state.isImage = true;
    stopQuizTimer();
    timerDeadline = null;
    state.retryAction = () => startImageExtraction(state.images, state.originalRequest);
    showLoading("Reading your worksheet", "Vexel is extracting visible questions and answer choices. Unclear text will be flagged for review.");
    try {
      const data = await api("extract-image", {
        request: state.originalRequest,
        images: state.images.map((image) => ({ mimeType: image.mimeType, data: image.data }))
      });
      if (requestId !== requestSequence) return;
      if (!Array.isArray(data.questions) || !data.questions.length) {
        throw new Error("No questions could be read reliably. Upload a clearer photo showing the full question and its options.");
      }
      state.extractedQuestions = data.questions.map((question, index) => ({
        id: String(question.id || ("imgq" + (index + 1))),
        type: question.type === "mcq" ? "mcq" : "short",
        question: String(question.question || ""),
        choices: Array.isArray(question.choices) ? question.choices.map((choice, choiceIndex) => ({
          id: String.fromCharCode(65 + choiceIndex),
          text: String(choice.text || "")
        })) : [],
        marks: Math.min(20, Math.max(1, Number(question.marks) || 1)),
        needsClarification: Boolean(question.needsClarification),
        clarification: String(question.clarification || "")
      }));
      state.mode = "review";
      renderImageReview();
    } catch (error) {
      if (requestId !== requestSequence) return;
      showError("Couldn't read this worksheet", error.message, () => startImageExtraction(state.images, state.originalRequest));
    }
  }

  function renderImageReview() {
    state.mode = "review";
    const body = screen("Review extracted questions", "Beta feature: check the transcription against your image before Vexel prepares the marking key. Uncertain text must be corrected before continuing.");
    const note = el("div", "ed-note", "Vexel does not save this exercise as chat history. Images are sent to Gemini for processing, so avoid uploading private information. Check numbers, signs, units, and option order carefully.");
    body.append(note);
    const imageRow = el("div", "ed-image-row");
    state.images.forEach((image, index) => {
      const figure = el("figure", "ed-source-thumb");
      const img = el("img");
      img.src = image.previewUrl || ("data:" + image.mimeType + ";base64," + image.data);
      img.alt = "Uploaded worksheet image " + (index + 1);
      figure.append(img);
      figure.append(el("figcaption", "", "Page " + (index + 1)));
      const pageActions = el("div", "ed-source-actions");
      pageActions.append(makeButton("Replace", "ed-text-button", () => choosePageAction("replace", index)));
      pageActions.append(makeButton("Remove", "ed-text-button", () => {
        if (state.images.length <= 1) {
          alertNote(body, "Keep at least one worksheet image. Use Replace to change this page, or close the solver to cancel.", true);
          return;
        }
        const proceed = window.confirm("Remove page " + (index + 1) + " and re-read the remaining pages? Text edits on this review screen will reset.");
        if (!proceed) return;
        const remaining = state.images.filter((_, pageIndex) => pageIndex !== index);
        startImageExtraction(remaining, state.originalRequest);
      }));
      figure.append(pageActions);
      imageRow.append(figure);
    });
    body.append(imageRow);
    const imageActions = el("div", "ed-inline-actions");
    if (state.images.length < MAX_IMAGE_FILES) {
      imageActions.append(makeButton("Add another page", "ed-button ed-button-secondary", () => choosePageAction("add")));
    }
    imageActions.append(makeButton("Replace all images", "ed-button ed-button-secondary", () => {
      if (!window.confirm("Replace the current worksheet pages? Any manual text corrections on this screen will reset.")) return;
      startImageInput();
    }));
    body.append(imageActions);

    state.extractedQuestions.forEach((question, index) => {
      const card = el("section", "ed-panel ed-review-card");
      const rowHeader = el("div", "ed-row-between");
      rowHeader.append(el("h2", "", "Question " + (index + 1)));
      rowHeader.append(makeButton("Remove", "ed-text-button", () => {
        if (state.extractedQuestions.length <= 1) {
          alertNote(body, "Keep at least one question in the worksheet.", true);
          return;
        }
        state.extractedQuestions.splice(index, 1);
        renderImageReview();
      }));
      card.append(rowHeader);
      if (question.needsClarification || question.clarification) {
        alertNote(card, "Please check the photo: " + (question.clarification || "Some source text may be unclear."), true);
      }
      card.append(el("label", "ed-label", "Question text"));
      const text = el("textarea", "ed-field ed-question-editor");
      text.value = question.question;
      text.rows = 3;
      text.addEventListener("input", () => {
        question.question = text.value;
        if (question.needsClarification) {
          question.needsClarification = false;
          question.clarification = "";
          const warning = card.querySelector(".ed-note-error");
          if (warning) warning.remove();
        }
      });
      card.append(text);
      const metaRow = el("div", "ed-meta-grid");
      const typeWrap = el("div", "");
      typeWrap.append(el("label", "ed-label", "Answer format"));
      const typeSelect = el("select", "ed-field");
      [["mcq", "Multiple choice"], ["short", "Written answer"]].forEach(([value, label]) => {
        const option = el("option", "", label);
        option.value = value;
        option.selected = question.type === value;
        typeSelect.append(option);
      });
      typeSelect.addEventListener("change", () => {
        question.type = typeSelect.value;
        if (question.type === "mcq" && question.choices.length < 2) {
          question.choices = [
            { id: "A", text: "" }, { id: "B", text: "" },
            { id: "C", text: "" }, { id: "D", text: "" }
          ];
        }
        renderImageReview();
      });
      typeWrap.append(typeSelect);
      metaRow.append(typeWrap);
      const markWrap = el("div", "");
      markWrap.append(el("label", "ed-label", "Marks available"));
      const markInput = el("input", "ed-field");
      markInput.type = "number";
      markInput.min = "1";
      markInput.max = "20";
      markInput.step = "1";
      markInput.value = String(question.marks);
      markInput.addEventListener("change", () => {
        question.marks = Math.min(20, Math.max(1, Number(markInput.value) || 1));
        markInput.value = String(question.marks);
      });
      markWrap.append(markInput);
      metaRow.append(markWrap);
      card.append(metaRow);
      if (question.type === "mcq") {
        const choicesWrap = el("div", "ed-choice-editor-list");
        card.append(el("label", "ed-label", "Original answer choices, in order"));
        question.choices.forEach((choice, choiceIndex) => {
          const choiceRow = el("div", "ed-choice-editor-row");
          choiceRow.append(el("span", "ed-choice-letter", String.fromCharCode(65 + choiceIndex)));
          const choiceInput = el("input", "ed-field");
          choiceInput.type = "text";
          choiceInput.maxLength = 1500;
          choiceInput.value = choice.text;
          choiceInput.setAttribute("aria-label", "Choice " + String.fromCharCode(65 + choiceIndex));
          choiceInput.addEventListener("input", () => { choice.text = choiceInput.value; });
          choiceRow.append(choiceInput);
          choicesWrap.append(choiceRow);
        });
        const addChoice = makeButton("Add choice", "ed-button ed-button-secondary ed-small-button", () => {
          if (question.choices.length >= 8) {
            alertNote(card, "A maximum of eight options is supported for one question.", true);
            return;
          }
          question.choices.push({ id: String.fromCharCode(65 + question.choices.length), text: "" });
          renderImageReview();
        });
        choicesWrap.append(addChoice);
        card.append(choicesWrap);
      }
      body.append(card);
    });
    const actions = el("div", "ed-sticky-actions");
    actions.append(makeButton("Back / cancel", "ed-button ed-button-secondary", closeEducation));
    actions.append(makeButton("Prepare answer key and start", "ed-button ed-button-primary", startImageSolving));
    body.append(actions);
  }

  async function startImageSolving() {
    const requestId = ++requestSequence;
    const unresolved = state.extractedQuestions.find((question) => question.needsClarification);
    if (unresolved) {
      showError(
        "Review unclear source text",
        "Question " + (state.extractedQuestions.indexOf(unresolved) + 1) + " was flagged as unreadable. Correct its question text in the review screen before starting so Vexel does not guess at missing content.",
        renderImageReview
      );
      return;
    }
    for (const question of state.extractedQuestions) {
      question.question = String(question.question || "").trim();
      question.choices = (question.choices || []).map((choice, index) => ({
        id: String.fromCharCode(65 + index),
        text: String(choice.text || "").trim()
      }));
      if (!question.question) {
        showError("Question text is missing", "Fill in the question text for every item before continuing.", renderImageReview);
        return;
      }
      if (question.type === "mcq" && (question.choices.length < 2 || question.choices.some((choice) => !choice.text))) {
        showError("Answer choices are incomplete", "Complete every visible option or change this item's answer format to Written answer.", renderImageReview);
        return;
      }
    }
    state.retryAction = startImageSolving;
    showLoading("Preparing your worksheet test", "Vexel is checking the source questions and preparing reference answers. Uncertain answers will not be silently graded.");
    try {
      const data = await api("prepare-image", {
        questions: state.extractedQuestions.map((question) => ({
          id: question.id,
          type: question.type,
          question: question.question,
          choices: question.choices,
          marks: question.marks
        })),
        images: state.images.map((image) => ({ mimeType: image.mimeType, data: image.data }))
      });
      if (requestId !== requestSequence) return;
      validateClientQuiz(data.quiz, data.quizToken, state.extractedQuestions.length);
      state.quiz = data.quiz;
      state.quizToken = data.quizToken;
      state.answers = {};
      state.index = 0;
      state.results = null;
      state.mode = "active";
      state.isImage = true;
      renderQuestion();
    } catch (error) {
      if (requestId !== requestSequence) return;
      showError("Couldn't prepare the answer key", error.message, renderImageReview);
    }
  }

  let activeRecognition = null;
  let activeRecognitionCleanup = null;
  let recognitionTimeout = null;
  function stopRecognition() {
    if (recognitionTimeout !== null) window.clearTimeout(recognitionTimeout);
    recognitionTimeout = null;
    if (activeRecognition) {
      try { activeRecognition.onresult = null; activeRecognition.onerror = null; activeRecognition.onend = null; activeRecognition.stop(); } catch {}
    }
    activeRecognition = null;
    if (activeRecognitionCleanup) activeRecognitionCleanup();
    activeRecognitionCleanup = null;
  }

  function normalizeAnswer(value) {
    return String(value || "").toLocaleLowerCase().normalize("NFKC")
      .replace(/[“”"']/g, "")
      .replace(/[.,!?;:()[\]{}]/g, " ")
      .replace(/\s+/g, " ").trim();
  }

  function mapTypedChoice(question, value) {
    const raw = String(value || "").trim();
    if (!raw) return { error: "Speak or type an answer first." };
    const letters = raw.match(/^(?:option|choice|answer)?\s*([a-h])$/i);
    if (letters) {
      const target = question.choices.find((choice) => choice.id.toUpperCase() === letters[1].toUpperCase());
      if (target) return { choiceId: target.id };
    }
    const ordinal = raw.match(/\b(first|1st|one|second|2nd|two|third|3rd|three|fourth|4th|four|fifth|5th|five|sixth|6th|six|seventh|7th|seven|eighth|8th|eight)\s+(?:option|choice|answer)\b/i);
    if (ordinal) {
      const word = ordinal[1].toLowerCase();
      const ordinals = { first: 0, "1st": 0, one: 0, second: 1, "2nd": 1, two: 1, third: 2, "3rd": 2, three: 2, fourth: 3, "4th": 3, four: 3, fifth: 4, "5th": 4, five: 4, sixth: 5, "6th": 5, six: 5, seventh: 6, "7th": 6, seven: 6, eighth: 7, "8th": 7, eight: 7 };
      const optionIndex = ordinals[word];
      if (optionIndex < question.choices.length) return { choiceId: question.choices[optionIndex].id };
    }
    let candidate = normalizeAnswer(raw)
      .replace(/^(the\s+)?(answer\s+is|it\s+is|i\s+choose|i\s+pick|option|choice)\s+/, "")
      .trim();
    const normalizedChoices = question.choices.map((choice) => ({ id: choice.id, text: normalizeAnswer(choice.text) }));
    const exact = normalizedChoices.filter((choice) => choice.text === candidate);
    if (exact.length === 1) return { choiceId: exact[0].id };
    if (exact.length > 1) return { error: "That answer matches more than one option. Please tap the option you mean." };
    const matches = normalizedChoices.filter((choice) => choice.text && (choice.text.includes(candidate) || candidate.includes(choice.text)));
    if (matches.length === 1 && candidate.length >= 3) return { choiceId: matches[0].id };
    if (matches.length > 1) return { error: "That answer could match more than one option. Please choose the correct option directly." };
    return { error: "Vexel could not confidently match that response to an option. Correct the text or tap an answer choice." };
  }

  function applyTypedAnswer(question, input, feedback) {
    const value = input.value.trim();
    if (!value) {
      feedback.textContent = "Enter or speak an answer first.";
      feedback.classList.add("ed-inline-error");
      return;
    }
    if (question.type === "mcq") {
      const mapping = mapTypedChoice(question, value);
      if (mapping.error) {
        feedback.textContent = mapping.error;
        feedback.classList.add("ed-inline-error");
        return;
      }
      state.answers[question.id] = { choiceId: mapping.choiceId };
      feedback.className = "ed-feedback";
      feedback.textContent = "Answer saved as option " + mapping.choiceId + ". You can still change it.";
    } else {
      state.answers[question.id] = { text: value };
      feedback.className = "ed-feedback";
      feedback.textContent = "Written answer saved. You can still edit it.";
    }
    syncQuestionSelection(question);
  }

  function syncQuestionSelection(question) {
    root.querySelectorAll("[data-choice-id]").forEach((button) => {
      const selected = state.answers[question.id]?.choiceId === button.getAttribute("data-choice-id");
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function beginQuestionVoice(question, input, feedback, micButton) {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      feedback.className = "ed-feedback ed-note-error";
      feedback.textContent = "Voice typing is not supported by this browser. Use the answer field or tap an option instead.";
      return;
    }
    stopRecognition();
    let finalTranscript = "";
    const recognition = new Recognition();
    activeRecognition = recognition;
    recognition.lang = navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    micButton.textContent = "Stop listening";
    micButton.classList.add("listening");
    feedback.className = "ed-feedback";
    feedback.textContent = "Starting voice recognition. Allow microphone access if your browser asks, then speak your answer.";
    activeRecognitionCleanup = () => {
      micButton.textContent = "Use voice";
      micButton.classList.remove("listening");
    };
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalTranscript += transcript;
        else interim += transcript;
      }
      input.value = (finalTranscript + " " + interim).trim();
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    recognition.onerror = (event) => {
      if (recognitionTimeout !== null) window.clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
      const messages = {
        "not-allowed": "Microphone permission was denied. Enable microphone access or type your answer.",
        "service-not-allowed": "The browser blocked speech recognition. Type your answer or select an option.",
        "network": "Speech recognition had a network problem. Your answer was not graded; try again or type it.",
        "no-speech": "No speech was detected. Nothing was marked wrong; try again or type your answer.",
        "audio-capture": "No working microphone was detected. Type your answer or select an option."
      };
      feedback.className = "ed-feedback ed-note-error";
      feedback.textContent = messages[event.error] || "Voice recognition failed. Nothing was marked wrong; you can try again or type your answer.";
    };
    recognition.onend = () => {
      if (recognitionTimeout !== null) window.clearTimeout(recognitionTimeout);
      recognitionTimeout = null;
      if (activeRecognition === recognition) activeRecognition = null;
      if (activeRecognitionCleanup) activeRecognitionCleanup();
      activeRecognitionCleanup = null;
      if (input.value.trim()) {
        feedback.className = "ed-feedback";
        feedback.textContent = "Transcript ready. Review or correct it, then choose Use typed answer. Speech failure never counts as a wrong answer.";
      }
    };
    try {
      recognition.start();
      recognitionTimeout = window.setTimeout(() => {
        if (activeRecognition !== recognition) return;
        try { recognition.stop(); } catch {}
        if (!input.value.trim()) {
          feedback.className = "ed-feedback ed-note-error";
          feedback.textContent = "Voice recognition timed out. Nothing was marked wrong; try speaking again or type your answer.";
        }
      }, 15000);
    } catch (error) {
      stopRecognition();
      feedback.className = "ed-feedback ed-note-error";
      feedback.textContent = "Vexel couldn't start the microphone. Nothing was marked wrong; type your answer or select an option.";
    }
  }

  function renderQuestion() {
    stopRecognition();
    state.mode = "active";
    const quiz = state.quiz;
    const question = quiz.questions[state.index];
    const body = screen(quiz.title || (state.isImage ? "Image Question Solver (Beta)" : "Your test"), (quiz.subject || "Practice questions") + " · " + (quiz.difficulty || "Source questions"));
    const topRow = el("div", "ed-row-between ed-progress-title");
    topRow.append(el("span", "", "Question " + (state.index + 1) + " of " + quiz.questions.length));
    const topMeta = el("div", "ed-question-meta");
    if (Number(quiz.durationMinutes) > 0) {
      const timerLabel = el("span", "ed-timer-label");
      timerLabel.id = "edTimerLabel";
      timerLabel.setAttribute("aria-label", "Time remaining");
      topMeta.append(timerLabel);
    }
    topMeta.append(el("span", "ed-muted", question.marks + (question.marks === 1 ? " mark" : " marks")));
    topRow.append(topMeta);
    body.append(topRow);
    const progress = el("div", "ed-progress");
    const progressBar = el("div", "ed-progress-bar");
    progressBar.style.width = (((state.index + 1) / quiz.questions.length) * 100) + "%";
    progress.append(progressBar);
    body.append(progress);

    const card = el("section", "ed-panel ed-question-card");
    const typeLabel = el("span", "ed-tag", question.type === "mcq" ? "MULTIPLE CHOICE" : "WRITTEN ANSWER");
    card.append(typeLabel);
    const questionTitle = el("h2", "ed-question-title", question.question);
    card.append(questionTitle);
    if (question.type === "mcq") {
      const choiceList = el("div", "ed-options");
      question.choices.forEach((choice, index) => {
        const button = makeButton("", "ed-option", () => {
          state.answers[question.id] = { choiceId: choice.id };
          syncQuestionSelection(question);
          feedback.className = "ed-feedback";
          feedback.textContent = "Selected option " + choice.id + ". No answer is marked until you submit.";
        });
        button.setAttribute("data-choice-id", choice.id);
        button.setAttribute("aria-pressed", String(state.answers[question.id]?.choiceId === choice.id));
        if (state.answers[question.id]?.choiceId === choice.id) button.classList.add("selected");
        button.append(el("span", "ed-choice-letter", String.fromCharCode(65 + index)));
        button.append(el("span", "ed-choice-text", choice.text));
        choiceList.append(button);
      });
      card.append(choiceList);
    }

    card.append(el("label", "ed-label", question.type === "mcq" ? "Or type or speak an option" : "Type or speak your answer"));
    const answerInput = question.type === "mcq" ? el("input", "ed-field") : el("textarea", "ed-field ed-answer-textarea");
    if (question.type === "mcq") {
      answerInput.type = "text";
      answerInput.placeholder = "For example, B, Option B, or the answer text";
      answerInput.value = state.answers[question.id]?.typedDraft || "";
    } else {
      answerInput.rows = 4;
      answerInput.placeholder = "Write your answer here. Partial credit may be available after submission.";
      answerInput.value = state.answers[question.id]?.text || "";
      answerInput.addEventListener("input", () => {
        state.answers[question.id] = { text: answerInput.value };
      });
    }
    const inputActions = el("div", "ed-inline-actions");
    const mic = makeButton("Use voice", "ed-button ed-button-secondary", () => {
      if (activeRecognition) {
        try { activeRecognition.stop(); } catch {}
      } else {
        beginQuestionVoice(question, answerInput, feedback, mic);
      }
    });
    mic.setAttribute("aria-label", "Speak an answer for this question");
    inputActions.append(mic);
    if (question.type === "mcq") {
      inputActions.append(makeButton("Use typed answer", "ed-button ed-button-secondary", () => {
        state.answers[question.id] = { typedDraft: answerInput.value };
        applyTypedAnswer(question, answerInput, feedback);
      }));
    } else {
      inputActions.append(makeButton("Save written answer", "ed-button ed-button-secondary", () => {
        applyTypedAnswer(question, answerInput, feedback);
      }));
    }
    card.append(answerInput);
    card.append(inputActions);
    const feedback = el("p", "ed-feedback");
    feedback.setAttribute("aria-live", "polite");
    card.append(feedback);
    if (question.type === "mcq" && state.answers[question.id]?.typedDraft) {
      feedback.textContent = "Typed answer draft. Use typed answer to select the matching choice.";
    }
    body.append(card);

    const navigatorPanel = el("section", "ed-question-nav");
    navigatorPanel.append(el("div", "ed-label", "Question navigator"));
    const navButtons = el("div", "ed-number-list");
    quiz.questions.forEach((item, index) => {
      const answered = item.type === "mcq" ? Boolean(state.answers[item.id]?.choiceId) : Boolean(String(state.answers[item.id]?.text || "").trim());
      const nav = makeButton(String(index + 1), "ed-number" + (index === state.index ? " current" : "") + (answered ? " answered" : ""), () => {
        saveVisibleDraft(question, answerInput);
        state.index = index;
        renderQuestion();
      });
      nav.setAttribute("aria-label", "Question " + (index + 1) + (answered ? ", answered" : ", unanswered"));
      nav.setAttribute("aria-current", index === state.index ? "step" : "false");
      navButtons.append(nav);
    });
    navigatorPanel.append(navButtons);
    const navActions = el("div", "ed-sticky-actions");
    navActions.append(makeButton("Previous", "ed-button ed-button-secondary", () => {
      saveVisibleDraft(question, answerInput);
      if (state.index > 0) {
        state.index--;
        renderQuestion();
      }
    }));
    if (state.index < quiz.questions.length - 1) {
      navActions.append(makeButton("Next question", "ed-button ed-button-primary", () => {
        saveVisibleDraft(question, answerInput);
        state.index++;
        renderQuestion();
      }));
    } else {
      navActions.append(makeButton("Submit test", "ed-button ed-button-primary", submitTest));
    }
    navigatorPanel.append(navActions);
    body.append(navigatorPanel);
    body.append(el("p", "ed-privacy-note", "Answering by voice uses browser speech recognition when supported. Check the transcript before saving it. No feedback is revealed until submission."));
    startQuizTimer();
  }

  function saveVisibleDraft(question, input) {
    if (question.type === "short") {
      state.answers[question.id] = { text: input.value };
      return;
    }

    const current = Object.assign({}, state.answers[question.id] || {});
    if (input.value.trim()) current.typedDraft = input.value;
    else delete current.typedDraft;

    if (current.choiceId || current.typedDraft) state.answers[question.id] = current;
    else delete state.answers[question.id];
  }

  async function submitTest(autoSubmit = false) {
    if (state.submitting || !state.quizToken) return;
    const requestId = ++requestSequence;
    const currentQuestion = state.quiz.questions[state.index];
    const currentInput = root.querySelector(".ed-question-card .ed-field");
    if (currentQuestion && currentInput) saveVisibleDraft(currentQuestion, currentInput);
    for (const question of state.quiz.questions) {
      const draft = state.answers[question.id];
      if (question.type === "mcq" && draft?.typedDraft?.trim() && !draft.choiceId) {
        const mapped = mapTypedChoice(question, draft.typedDraft);
        if (mapped.error) {
          state.index = state.quiz.questions.findIndex((item) => item.id === question.id);
          renderQuestion();
          const feedback = root.querySelector(".ed-feedback");
          if (feedback) {
            feedback.className = "ed-feedback ed-inline-error";
            feedback.textContent = mapped.error + " Choose an option or correct this typed answer before submitting.";
          }
          return;
        }
        state.answers[question.id] = { choiceId: mapped.choiceId };
      }
    }
    const answered = state.quiz.questions.filter((question) => {
      const answer = state.answers[question.id];
      return question.type === "mcq" ? Boolean(answer?.choiceId) : Boolean(String(answer?.text || "").trim());
    }).length;
    const unanswered = state.quiz.questions.length - answered;
    if (!autoSubmit && !window.confirm("Submit this test now? " + answered + " answered, " + unanswered + " unanswered. Answers cannot be changed after you see the results.")) return;
    state.submitting = true;
    stopQuizTimer();
    const answers = state.quiz.questions.map((question) => ({
      id: question.id,
      choiceId: state.answers[question.id]?.choiceId || "",
      text: question.type === "mcq" ? (state.answers[question.id]?.typedDraft || "") : (state.answers[question.id]?.text || "")
    }));
    showLoading(autoSubmit ? "Time is up — submitting your answers" : "Marking your answers", autoSubmit ? "The deadline has passed. Vexel is submitting the answers available at the deadline." : "Vexel is calculating the score and preparing explanations. If evaluation fails, your answers remain available to retry.");
    try {
      const data = await api("grade", { quizToken: state.quizToken, answers: answers });
      if (requestId !== requestSequence) return;
      if (!data.result || !Array.isArray(data.result.results) || data.result.results.length !== state.quiz.questions.length ||
          !Number.isFinite(data.result.earnedMarks) || !Number.isFinite(data.result.maxMarks)) {
        throw new Error("Vexel returned an incomplete grading result. Your answers are preserved; please retry.");
      }
      state.results = data.result;
      state.mode = "results";
      renderResults();
    } catch (error) {
      if (requestId !== requestSequence) return;
      showError("Couldn't grade your answers", error.message + " Your answers have been kept.", () => submitTest());
    } finally {
      state.submitting = false;
    }
  }

  function renderResults() {
    stopQuizTimer();
    state.mode = "results";
    const result = state.results;
    const body = screen("Your results", "Review your marks and use the explanations to decide what to revise next.");
    const summary = el("section", "ed-panel ed-results-summary");
    summary.append(el("div", "ed-eyebrow", result.gradeLabel || "RESULT"));
    summary.append(el("div", "ed-score", result.percentage + "%"));
    summary.append(el("h2", "", result.gradeLabel || "Completed"));
    summary.append(el("p", "ed-muted", result.earnedMarks + " / " + result.maxMarks + " marks"));
    const stats = el("div", "ed-stats");
    [
      ["Correct", result.correct, "ed-stat-correct"],
      ["Incorrect", result.incorrect, "ed-stat-wrong"],
      ["Partial", result.partiallyCorrect || 0, "ed-stat-partial"],
      ["Unanswered", result.unanswered, "ed-stat-neutral"]
    ].forEach(([label, value, className]) => {
      const tile = el("div", "ed-stat " + className);
      tile.append(el("span", "", label));
      tile.append(el("strong", "", value));
      stats.append(tile);
    });
    summary.append(stats);
    summary.append(el("p", "ed-muted", gradeSummary(result.percentage)));
    body.append(summary);
    body.append(el("h2", "ed-review-heading", "Question-by-question review"));
    result.results.forEach((item, index) => {
      const question = state.quiz.questions.find((candidate) => candidate.id === item.questionId);
      const card = el("section", "ed-panel ed-result-card");
      const header = el("div", "ed-row-between");
      header.append(el("h3", "", "Question " + (index + 1)));
      const statusText = item.status === "correct" ? "Correct" : item.status === "partially_correct" ? "Partially correct" : item.status === "unanswered" ? "Unanswered" : "Incorrect";
      const status = el("span", "ed-status ed-status-" + item.status, statusText);
      header.append(status);
      card.append(header);
      card.append(el("p", "ed-result-question", question?.question || "Question text unavailable."));
      card.append(el("p", "ed-marks-line", "Marks: " + item.marksAwarded + " / " + item.maxMarks));
      card.append(el("div", "ed-result-label", "Your answer"));
      card.append(el("p", "ed-result-answer", item.userAnswer ? item.userAnswer : "Not answered"));
      card.append(el("div", "ed-result-label", "Correct / reference answer"));
      card.append(el("p", "ed-result-answer", item.referenceAnswer || "No reliable reference answer was returned."));
      if (Array.isArray(item.correctPoints) && item.correctPoints.length) {
        card.append(el("div", "ed-result-label", "What you got right"));
        const list = el("ul", "ed-feedback-list");
        item.correctPoints.forEach((point) => list.append(el("li", "", point)));
        card.append(list);
      }
      if (Array.isArray(item.errors) && item.errors.length) {
        card.append(el("div", "ed-result-label", "What to correct"));
        const list = el("ul", "ed-feedback-list");
        item.errors.forEach((point) => list.append(el("li", "", point)));
        card.append(list);
      }
      card.append(el("div", "ed-result-label", "Explanation"));
      card.append(el("p", "ed-explanation", item.explanation || "No additional explanation was provided."));
      body.append(card);
    });
    const actions = el("div", "ed-sticky-actions");
    actions.append(makeButton("Close", "ed-button ed-button-secondary", closeEducation));
    actions.append(makeButton("Retake this test", "ed-button ed-button-secondary", () => {
      state.answers = {};
      state.index = 0;
      state.results = null;
      state.mode = "active";
      stopQuizTimer();
      timerDeadline = null;
      renderQuestion();
    }));
    actions.append(makeButton("New test", "ed-button ed-button-primary", () => {
      closeEducation();
      const prompt = document.getElementById("promptInput");
      if (prompt) {
        prompt.placeholder = "Describe the test you want to create…";
        prompt.focus();
      }
    }));
    body.append(actions);
  }

  function gradeSummary(percentage) {
    if (percentage >= 90) return "Excellent work. Review any missed questions to strengthen retention.";
    if (percentage >= 75) return "Good progress. Check the missed questions and revisit the concepts behind them.";
    if (percentage >= 50) return "You have a useful starting point. Focus on the explanations for missed and partial answers, then try another practice run.";
    return "Use the explanations as a study guide. Revisit the core concepts and try another practice run.";
  }

  function showError(title, message, retry) {
    state.mode = "error";
    const body = screen(title || "Something went wrong", "Vexel will not guess at a score or mark an input failure as incorrect.");
    const panel = el("section", "ed-panel");
    alertNote(panel, message || "Please try again.", true);
    const actions = el("div", "ed-actions");
    actions.append(makeButton("Close", "ed-button ed-button-secondary", closeEducation));
    if (typeof retry === "function") actions.append(makeButton("Try again", "ed-button ed-button-primary", retry));
    panel.append(actions);
    body.append(panel);
  }

  const originalSendMessage = typeof window.sendMessage === "function" ? window.sendMessage.bind(window) : null;
  if (originalSendMessage) {
    window.sendMessage = function (regenerating) {
      if (regenerating) return originalSendMessage.apply(this, arguments);
      const prompt = document.getElementById("promptInput");
      const text = prompt ? prompt.value.trim() : "";
      const images = composerImages();
      if (images.length && isImageQuestionIntent(text)) {
        clearComposerImages();
        if (prompt) {
          prompt.value = "";
          prompt.style.height = "44px";
        }
        startImageExtraction(images, text);
        return;
      }
      if (isQuizIntent(text) && images.length === 0) {
        if (prompt) {
          prompt.value = "";
          prompt.style.height = "44px";
        }
        const pdfMarker = text.indexOf("[PDF Content]:");
        const requestText = pdfMarker >= 0 ? text.slice(0, pdfMarker).trim() : text;
        const sourceText = pdfMarker >= 0 ? text.slice(pdfMarker + "[PDF Content]:".length).trim().slice(0, 12000) : "";
        let topic = topicFromText(requestText);
        if ((!topic || topic.length < 2) && sourceText) topic = "Uploaded study material";
        const count = countQuestions(requestText);
        const difficulty = difficultyFromText(requestText);
        const durationMinutes = requestedDurationMinutes(requestText);
        const spec = {
          request: requestText,
          sourceText: sourceText,
          topic: topic,
          count: count,
          difficulty: difficulty,
          durationMinutes: durationMinutes,
          level: levelFromText(requestText)
        };
        if (!topic || topic.length < 2) renderTopicClarification(requestText, count, difficulty, sourceText, durationMinutes, spec.level);
        else startGeneratedTest(spec);
        return;
      }
      return originalSendMessage.apply(this, arguments);
    };
  }

  picker.addEventListener("change", handlePickerChange);
  pagePicker.addEventListener("change", handlePagePickerChange);
  const plusMenu = document.getElementById("plusMenu");
  if (plusMenu) {
    const item = el("button", "plus-menu-item");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.append(el("span", "icon", "▧"));
    item.append(el("span", "", "Solve questions from image (Beta)"));
    item.addEventListener("click", () => {
      if (typeof window.togglePlusMenu === "function") window.togglePlusMenu(false);
      startImageInput();
    });
    plusMenu.append(item);
    const quizItem = el("button", "plus-menu-item");
    quizItem.type = "button";
    quizItem.setAttribute("role", "menuitem");
    quizItem.append(el("span", "icon", "✓"));
    quizItem.append(el("span", "", "Create interactive test"));
    quizItem.addEventListener("click", () => {
      if (typeof window.togglePlusMenu === "function") window.togglePlusMenu(false);
      renderTopicClarification("", 10, "Medium");
    });
    plusMenu.append(quizItem);
  }

  console.info("[Vexel education] Interactive test and beta image solver loaded.");

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !root.hidden) {
      closeEducation();
    }
  }, true);
})();



