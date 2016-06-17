var async = require('async');
var mongoose = require('mongoose');

var Schedule = app.helpers.Schedule;
var Security = app.helpers.Security;
var Request = app.helpers.Request;
var Model = app.models.Matricula;

var Models = app.models;

var renderFields = null;

//
// (private) Verifica vagas disponíveis nas turmas
//
exports._vagasDisponiveis = function (turmasId, next){
  var toMatchTurma = null;

  // Converte para ObjectId
  if(_.isArray(turmasId)){
    var turmasIdObject = turmasId.map(turma => mongoose.Types.ObjectId(turma));
    toMatchTurma = {$in: turmasIdObject};
  }

  // Cria aggregate pipeline
  var aggregate = Models.Matricula.aggregate();

  // Encontra turmas
  if(toMatchTurma)
    aggregate.match({
      _turma: toMatchTurma
    });

  aggregate
    // Projeta apenas alguns campos
    .project({
      _id: 1,
      _turma: 1,
      _aluno: 1,
    })
    // Agrupa com cada Aluno
    // .lookup({
    //   from: 'Aluno',
    //   localField: '_aluno',
    //   foreignField: '_id',
    // })
    // Agrupa por _turma, e soma vagas
    .group({
      _id: '$_turma',
      ingressos: {$sum: 1},
    });

  aggregate.exec(function (err, collection){
    if(err)
      return next(err);

    // Mapeia de volta as vagas, e deixa 0 como default
    var vagas = {};
    for(var k in turmasId){
      let id = turmasId[k];
      vagas[id] = 0;
    }

    for(var k in collection){
      let turma = collection[k];
      vagas[turma._id] = turma.ingressos;
    }

    return next(null, vagas);
  })
}

//
// Salva turmas na grade
//
exports.ingressar = function (req, res){
  var turmas = null;
  var turmasId = req.body.turmas;

  // Verifica se parametro `turmas` foi passado
  if( !('turmas' in req.body) || !_.isArray(turmasId))
    return res.status(500).send('Parâmetro faltando ou incorreto: turmas')

  console.log('Ingressar em :', turmasId)

  // Encontra turmas no banco de dados
  Models.Turma.find({
    _id: {$in: turmasId || []},
  }, verifyTurmas)

  // Verifica se turmas são válidas
  function verifyTurmas(err, models){
    if(err)
      return res.status(500).send(err);

    // Verifica se todas as matérias foram encontradas
    var missing = _.difference(turmasId, _.map(models, 'id'));
    if(missing.length > 0)
      return res.status(500).send('Matérias não encontradas: '+missing.join(','));

    // Salva objetos encontrados
    turmas = models

    // Verifica conflitos entre as matérias
    checkSchedule(models);
  }

  // Verifica conflitos
  function checkSchedule(turmas){
    var errors = Schedule.verifySchedule(turmas);

    if(errors)
      return res.status(500).send('Conflitos encontrados: '+errors.join(','));

    checkVacancy(turmas);
  }

  // Verifica se há vagas (Apenas em turmas que estão em modo de 'firstIn');
  function checkVacancy(turmas){
    // TODO: Implement se há vagas
    console.log('checkVacancy...?');
    exports._vagasDisponiveis(null, function (err, turmas){
      if(err)
        return res.status(500).send(err);

      res.send(turmas);
    })
  }
};

//
// Import data from UFABC
//
exports.importar = function (req, res){
  var mappedIds;
  var newModels;

  // Load all Turma ID's with ufabc_id
  app.models.Turma.aggregate([
    {$project: {_id: 1, ufabc_id: true}},
  ]).exec(function (err, turmas){
    if(err)
      return res.status(500).send(err);

    // Index by ID
    mappedIds = {};
    for(var k in turmas)
      mappedIds[turmas[k].ufabc_id] = turmas[k]._id;

    // Continue loading vagas
    loadVagas();
  })

  // Load vagas
  function loadVagas(){
    app.helpers.Matriculas.loadVagas((err, vagas) => {
      // Initialize array that keeps new models
      newModels = [];

      // Generate matriculas for each turma
      for(var ufabc_id in vagas){
        var _vagas = vagas[ufabc_id];
        var dbId = mappedIds[ufabc_id];

        if(!dbId){
          console.error('Cannot find ufabc_id: ', ufabc_id);
          continue;
        }

        // Create model for each vaga and add to newModels
        for(var k = 0; k < _vagas; k++){
          newModels.push({
            _turma: mongoose.Types.ObjectId(dbId),
            _aluno: mongoose.Types.ObjectId('574361ee54398e4899c8a31c')
          })
        }
      }

      // Import all models to DB
      app.models.Matricula.create(newModels, err => {
        if(err)
          return res.status(500).send(err);

        res.send(`Imported ${newModels.length} matriculas.`);
      })

    });
  }
};

//
// Limpa Matriculas
//
exports.erase = function (req, res){
  app.models.Matricula.remove({}, function (err, result){
    if(err)
      return res.status(500).send(err);

    res.send(result);
  })
}

//
// REST Api
//
exports.get = Request.get(Model, {
	deny: [],
	renderFields: renderFields,
});

exports.find = Request.find(Model, {
  deny: [],
	queryFields: null,
	renderFields: renderFields,
});

exports.create = Request.create(Model, {
  deny: [],
	renderFields: renderFields,
});

exports.update = Request.update(Model, {
  deny: [],
	renderFields: renderFields,
});

exports.delete = Request.destroy(Model, {
  deny: [],
	renderFields: renderFields,
});
