;(function(translator) {
	"use strict";
	/* globals RELATIVE_PATH, define */

	if (typeof module === 'object' && module.exports === translator) {
		exports = module.exports = translator;
	}

	var	languages = {},
		regexes = {
			match: /\[\[\w+:.*?\]\]/g,
			split: /[,][\s]*/,
			replace: /\]+$/
		};

	translator.addTranslation = function(language, filename, translations) {
		languages[language] = languages[language] || {};
		languages[language].loaded = languages[language].loaded || {};
		languages[language].loaded[filename] = translations;
		languages[language].loading = languages[language].loading || {};
	};

	translator.getTranslations = function(language, filename, callback) {
		if (languages[language] && languages[language].loaded[filename]) {
			callback(languages[language].loaded[filename]);
		} else {
			translator.load(language, filename, function() {
				callback(languages[language].loaded[filename]);
			});
		}
	};

	translator.escape = function(text) {
		return typeof text === 'string' ? text.replace(/\[\[([\S]*?)\]\]/g, '\\[\\[$1\\]\\]') : text;
	};

	translator.unescape = function(text) {
		return typeof text === 'string' ? text.replace(/\\\[\\\[([\S]*?)\\\]\\\]/g, '[[$1]]') : text;
	};

	translator.translate = function (text, language, callback) {
		if (typeof language === 'function') {
			callback = language;
			language = 'en';
		}

		if (!text) {
			return callback(text);
		}

		var keys = text.match(regexes.match);

		if (!keys) {
			return callback(text);
		}

		translateKeys(keys, text, language, callback);
	};

	function translateKeys(keys, text, language, callback) {
		var count = keys.length;
		if (!count) {
			return callback(text);
		}

		var data = {text: text};
		keys.forEach(function(key) {
			translateKey(key, data, language, function(translated) {
				--count;
				if (count <= 0) {
					callback(translated.text);
				}
			});
		});
	}

	function translateKey(key, data, language, callback) {
		key = '' + key;
		var variables = key.split(regexes.split);

		var parsedKey = key.replace('[[', '').replace(']]', '').split(':');
		parsedKey = [parsedKey[0]].concat(parsedKey.slice(1).join(':'));
		if (!(parsedKey[0] && parsedKey[1])) {
			return callback(data);
		}

		var languageFile = parsedKey[0];
		parsedKey = ('' + parsedKey[1]).split(',')[0];

		translator.load(language, languageFile, function(languageData) {
			data.text = insertLanguage(data.text, key, languageData[parsedKey], variables);
			callback(data);
		});
	}

	function insertLanguage(text, key, value, variables) {
		if (value) {
			for (var i = 1, ii = variables.length; i < ii; i++) {
				var variable = variables[i].replace(']]', '');
				value = value.replace('%' + i, variable);
			}

			text = text.replace(key, value);
		} else {
			var string = key.split(':');
			text = text.replace(key, string[string.length-1].replace(regexes.replace, ''));
		}

		return text;
	}

	translator.compile = function() {
		var args = Array.prototype.slice.call(arguments, 0);

		return '[[' + args.join(', ') + ']]';
	};

	translator.load = function (language, filename, callback) {
		if (isLanguageFileLoaded(language, filename)) {
			if (callback) {
				callback(languages[language].loaded[filename]);
			}
		} else if (isLanguageFileLoading(language, filename)) {
			if (callback) {
				addLanguageFileCallback(language, filename, callback);
			}
		} else {

			languages[language] = languages[language] || {loading: {}, loaded: {}, callbacks: []};

			languages[language].loading[filename] = true;

			load(language, filename, function(translations) {

				languages[language].loaded[filename] = translations;

				if (callback) {
					callback(translations);
				}

				while (languages[language].callbacks && languages[language].callbacks[filename] && languages[language].callbacks[filename].length) {
					languages[language].callbacks[filename].pop()(translations);
				}

				languages[language].loading[filename] = false;
			});
		}
	};

	function isLanguageFileLoaded(language, filename) {
		var languageObj = languages[language];
		return languageObj && languageObj.loaded && languageObj.loaded[filename] && !languageObj.loading[filename];
	}

	function isLanguageFileLoading(language, filename) {
		return languages[language] && languages[language].loading && languages[language].loading[filename];
	}

	function addLanguageFileCallback(language, filename, callback) {
		languages[language].callbacks = languages[language].callbacks || {};

		languages[language].callbacks[filename] = languages[language].callbacks[filename] || [];
		languages[language].callbacks[filename].push(callback);
	}

	function load(language, filename, callback) {
		if ('undefined' !== typeof window) {
			loadClient(language, filename, callback);
		} else {
			loadServer(language, filename, callback);
		}
	}

	function loadClient(language, filename, callback) {
		$.getJSON('/language/' + language + '/' + filename + '.json?v=' + (new Date()).getTime(), callback);
	}

	function loadServer(language, filename, callback) {
		var fs = require('fs'),
			path = require('path'),
			winston = require('winston');

		language = language || 'en';

		if (!fs.existsSync(path.join(__dirname, '../language', language))) {
			winston.warn('[translator] Language \'' + language + '\' not found. Defaulting to \'en\'');
			language = 'en';
		}

		fs.readFile(path.join(__dirname, '../language', language, filename + '.json'), function(err, data) {
			if (err) {
				winston.error('Could not load `' + filename + '`: ' + err.message + '. Skipping...');
				return callback({});
			}

			try {
				data = JSON.parse(data.toString());
			} catch (e) {
				winston.error('Could not parse `' + filename + '.json`, syntax error? Skipping...');
				data = {};
			}
			callback(data);
		});
	}


	if (typeof define === 'function' && define.amd) {
		define('translator', translator);

		var _translator = translator;
	}
})(
	typeof exports === 'object' ? exports :
	typeof define === 'function' && define.amd ? {} :
	translator = {}
);
