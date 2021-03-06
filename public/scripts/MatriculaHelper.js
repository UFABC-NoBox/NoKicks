var module = angular.module('MatriculaHelper', [

])

.service('Creditos', function () {
  var service = this;

  service.calcular = function (cr) {
    if(cr > 3.0)
      return 999;

    return Math.floor(16 + cr * 5);
  }
})

// Verificador de posição em turmas
.service('RankingLooker', function ($http, $rootScope, Turmas, Schedule) {
  var service = this;
  var _allIds = [];

  // Guarda posições verificadas
  service.rankings = {};

  // Subscribe for changes
  service.subscribe = function (scope, callback){
    var handler = $rootScope.$on('RankingLooker:changed', callback);
    scope.$on('$destroy', handler);
  }

  // Ouve pelas mudanças de Schedule, e faz a verificação das turmas faltantes
  Schedule.subscribe(null, queryRankings)

  // Atualiza rankings dando merge nos objetos
  service.updateRankings = function (newRankings){
    // Inclui novos rankings
    for(var k in newRankings){
      var rank = newRankings[k];

      service.rankings[rank._turma] = rank;
    }

    $rootScope.$emit('RankingLooker:changed');
  }

  // Verifica diferença das turmas, e faz verificação
  function queryRankings(){
    _allIds = Schedule.turmas;
    var missingIds = _.difference(_allIds, _.keys(service.rankings))

    // Remove rankigns desnecessários
    for(var k in _allIds){
      var rank = _allIds[k];

      if(rank in service.rankings)
        continue;

      delete service.rankings[rank];
    }

    // Already checked?
    if(missingIds.length <= 0)
      return;

    // Request it
    $http
      .post('/api/matriculas/simular', {
        turmas: missingIds,
      })
      .then(function (response) {
        if(response.status >= 400)
          return console.error('Não pode carregar dados', _allIds, missingIds, response.data);

        // Update list
        service.updateRankings(response.data);
      })
  }

})

.service('Schedule', function ($http, $rootScope, Turmas) {
  var service = this;

  // Guarda Id's das turmas
  service.turmas = [];

  // Subscribe for changes
  service.subscribe = function (scope, callback){
    var handler = $rootScope.$on('Schedule:changed', callback);
    scope && scope.$on('$destroy', handler);
  }

  service.getTurmas = function () {
    // Retorna lista de turmas
    var turmas = [];
    for(var k in service.turmas){
      var turma = Turmas.getTurmaById(service.turmas[k])
      turma && turmas.push(turma);
    }
    return turmas;
  }

  // Remove turmas da lista
  service.remove = function (turmas){
    service.turmas = _.difference(service.turmas, turmas || []);

    $rootScope.$emit('Schedule:changed');
  }

  service.set = function (turmas){
    service.turmas = turmas;

    $rootScope.$emit('Schedule:changed');
  }

  service.add = function (turmas){
    service.turmas = _.union(service.turmas, turmas || []);

    $rootScope.$emit('Schedule:changed');
  }

  service.toggle = function (turma){
    var idx = service.turmas.indexOf(turma);
    if (idx > -1)
      service.turmas.splice(idx, 1);
    else
      service.turmas.push(turma);

    $rootScope.$emit('Schedule:changed');
  }

  // Carrega matrículas do banco de dados
  service.load = function (next){
    $http
      .get('/api/matriculas/registros')
      .then(function (response) {
        if(response.status >= 400)
          return next && next('Não pode carregar dados', response.data);

        // Update list
        service.set(_.map(response.data, '_turma'));

        next && next();
      })
  }

  // Salva matrículas no BD
  service.save = function (next){
    $http
      .post('/api/matriculas/ingressar', {
        turmas: service.turmas,
      })
      .then(function (response) {
        if(response.status >= 400)
          return next && next('Não pode carregar dados', response.data);

        // Update list
        service.set(_.map(response.data, '_turma'));

        next && next();
      })
  }
})

.service('Turmas', function ($http, $rootScope, $timeout) {
  var service = this;
  var _indexByKey = '_id';
  var _turmasIndexed = {};

  service._turmasIndexed = _turmasIndexed;
  service.turmas = [];
  service.vagasById = {};
  service.filtered = {};
  service.loaded = false;
  service.progress = 0;

  // Subscribe for changes
  service.subscribe = function (scope, callback){
    var handler = $rootScope.$on('Turmas:update', callback);
    scope.$on('$destroy', handler);
  }

  // Publish change notification
  service.notify = function () {
    $rootScope.$emit('Turmas:update');
  }

  // Encontra turma por id (Indexado)
  service.getTurmaById = function (id) {
    if(id in _turmasIndexed)
      return service.turmas[_turmasIndexed[id]];

    return null;
  }

  // Adiciona novas turmas ao array
  service.updateTurmas = function (turmas) {
    turmas.forEach( function (turma) {
      // Skip if already inserted
      if(turma[_indexByKey] in _turmasIndexed)
        return;

      // Insert if not inserted yet
      service.turmas.push(turma);

      // Index this element
      _turmasIndexed[turma[_indexByKey]] = service.turmas.length - 1;
    });

    // Aplica busca novamente
    service.applySearch();
  }

  // Aplica filtros na busca local (cache)
  service.applySearch = function (params) {
    // Salva tempo de inicio
    var startTime = Date.now();

    // Aplica filtros default
    params = params || {
      curso: 19,
    };

    // Filtra turmas
    var turmas = _.filter(service.turmas, needsSelection);

    // Agrupa por curso
    var cursosCodigo = _.groupBy(service.turmas, 'codigo');

    // Agrupa por obrigatoriedade
    var cursos = {
      obrigatoria: {},
      limitada: {},
      livre: {},
    };

    for(var id in cursosCodigo){
      var curso = cursosCodigo[id][0];
      cursos[obrigatoriedade(curso)][id] = cursosCodigo[id];
    }

    service.cursos = cursos;

    // Função que seleciona turmas baseada na euristica escolhida
    function needsSelection(turma) {
      // TODO: Filter turma por Turno|Campus|...
      return true;
    }

    // Retorna tipo de obrigatoriedade dado a turma (e curso via params)
    function obrigatoriedade(turma) {
      return turma.obrigatoriedade[params.curso] || 'livre';
    }

    // Calcula tempo levado
    var took = Date.now() - startTime;
    // console.log('applySearch took', took + 'ms');

    // Publish notification
    service.notify();
  }

  // Encontra turmas no banco de dados que batem com a query.
  // Atualiza array e adiciona novos elementos
  service.query = function (params, next) {
    $http
      .get('/api/turmas/cached', {
        params: params || {
          $limit: 2000,
          $sort: 'turno'
        }
      })
      .then(function (response) {
        if(response.status >= 400)
          return next && next('Não pode carregar dados', response.data);

        // Update progress
        service.progress = 1.0;//response.data.page / response.data.pages;
        service.loaded = true;//service.progress >= 1.0;

        // Update list
        service.updateTurmas(response.data);

        next && next();
      })
  }

  // Carrega dados em batches
  var _batchTimeout = null;
  var _batchSize = 0;
  var _data = null;
  var _length = 0;
  service.loadInBatch = function (batchSize) {
    if(batchSize){
      // Clear timeout
      if(_batchTimeout)
        $timeout.cancel(_batchTimeout);

      _batchSize = batchSize;

      // Load data once
      $http.get('/api/turmas/cached', {
        params: {
          $limit: 2000,
          $sort: 'turno'
        }
      })
      .then(function (response) {
        if(response.status >= 400)
          return console.error('Não pode carregar dados', response.data);

        _data = response.data;
        _length = _data.length;

        processLoadedBatch();
      })
    }
  }

  function processLoadedBatch() {
    // Stop timeout if needed
    if(_batchTimeout)
      $timeout.cancel(_batchTimeout)

    // Cut data
    var newData = _data.splice(0, _batchSize);

    // Update progress
    service.progress = 1.0 - (_data.length * 1.0 / _length);
    service.loaded = service.progress >= 1.0;

    // Update store
    service.updateTurmas(newData);

    // Stop calling if ended data
    if(_data.length <= 0)
      return;

    _batchTimeout = $timeout(function (){
      processLoadedBatch();
    }, 600);
  }

  service.loadVagas = function (){
    $http.get('/api/matriculas/vagas', {})
      .then(function (response){
        if(response.status >= 400)
          return console.error('Não pode carregar dados', response.data);

        // Save data locally
        service.vagasById = response.data;

        // Notify changes
        service.notify();
      })
  }

})
