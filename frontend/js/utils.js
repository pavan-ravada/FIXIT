// js/utils.js

function formatTimestamp(ts) {
    if (!ts) return "-";
    return new Date(ts).toLocaleString();
}

function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
