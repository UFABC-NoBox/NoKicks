'use strict';

var request = require('request');

var Matriculas = module.exports = {};

Matriculas.URL = {
  BASE: 'https://matricula.ufabc.edu.br',

  // List of all courses
  DISCIPLINAS: '/cache/todasDisciplinas.js',

  // List of all vacancies
  VAGAS: '/cache/contagemMatriculas.js',
};

Matriculas.loadVagas = (next) => {
  let url = Matriculas.URL.BASE + Matriculas.URL.VAGAS;
  Matriculas.loadJsURLAsJson(url, next);
};

Matriculas.loadMaterias = (next) => {
  let url = Matriculas.URL.BASE + Matriculas.URL.DISCIPLINAS;
  Matriculas.loadJsURLAsJson(url, next);
};


Matriculas.loadJsURLAsJson = (URL, next) => {

  request.get({
    url: URL,
  }, (err, res, body) => {

    if(err)
      return next(err);

    if(res.statusCode != 200)
      return next('Failed to load: ' + res.statusCode);

    // Find '=' sign and ';' at the end
    var startIndex = body.indexOf('=');
    var endIndex = body.lastIndexOf(';');

    // Verifies token
    if(startIndex < 0 || endIndex < 0)
      return next('Could not find start/end token');

    // Find rest of text
    var json = body.slice(startIndex + 1, endIndex);

    try{
      json = JSON.parse(json);
    }catch(e){
      return next(e);
    }

    next(null, json);
  });

};
