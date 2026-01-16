

    function createLichessChallengeLink() {
      fetch('https://lichess.org/api/challenge/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'clock.limit': '180',
          'clock.increment': '2',
          'name': 'Mon embauche se jouerait-elle à une partie ? Défiez-moi !',
        })
      }).then(response => {
        return response.json();
      }).then(data => {
        sendNotification(`Quelqu'un veut te défier sur Lichess ! \n${data.url}`)
        window.open(data.url, '_blank');
      })
    }
