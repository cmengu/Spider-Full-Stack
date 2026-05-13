import re
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
# flag: CORS from day 1, wildcard any localhost port so that the frontend can access the backend from any port
CORS(app, origins=[re.compile(r'http://localhost:\d+')])


@app.route('/api/spider')
def spider():
    return jsonify([])


if __name__ == '__main__':
    app.run(port=5001, debug=True)
