var request = require('request');

var Authentication = app.helpers.Authentication;
var Aluno = app.models.Aluno;

exports.login = function (req, res) {

  // Verifies if action is to login,
  // or just return logged user
  var user = (req.body.user || '').toLowerCase();
  var pass = req.body.pass;
  var turno = req.body.turno;
  var cr = req.body.cr * 1;
  var captchaValue = req.body.captcha;

  if(turno != 'Noturno' && turno != 'Matutino')
    turno = null;

  if(cr <= 0 || cr > 4)
    cr = null;

  if(user && cr && turno){
    // Logout
    Authentication.logout(req);

    // Check captcha
    // if(!req.session.captcha || !captchaValue)
    //   return res.status(500).send('Invalid captcha');

    // Get autenticity token from google
    // app.helpers.PortalAluno.getCaptchaAuthenticity(
    //   req.session.captcha.token,
    //   captchaValue, (err, token) => {
    //     if(err)
    //       return res.status(500).send(err);

    // Authenticate
    Authentication.authenticate({
      user: user,
      pass: pass,

      turno: turno,
      cr: cr,
      // captchaChallenge: token,
      // captchaValue: 'manual_challenge',
    }, (err, aluno) => {
      // Remove captcha from session
      req.session.captcha = null;

      if(err)
        return res.status(401).send(err);

      // Login aluno
      Authentication.login(req, aluno);

      finishRender();
    })

    // })
  }else{
    finishRender();
  }

  function finishRender () {
    if(Authentication.isLogged(req))
      res.send(Authentication.loggedUser(req));
    else
      res.status(401).send('Usuário, CR ou Turno inválidos');
  }

}

exports.logout = function (req, res) {

  // Logout user
  Authentication.logout(req);
  res.send('Logged out');

}

exports.captcha = function (req, res) {
  app.helpers.PortalAluno.getCaptchaImageURL(function (err, captcha) {
    if(err)
      return res.status(500).send('Não pode carregar captcha!')

    req.session.captcha = captcha;

    request.get(captcha.url, { encoding: null }, function(err, resp, body) {
      if(err){
        console.log(err)
        return res.status(500).send('Falha ao carregar imagem!');
      }

      res.writeHead(200, resp.headers);
      res.end(body);
    });

  })
}
