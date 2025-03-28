exports.resultResponse = (statusCode, data = null) => {
	return {
		statusCode: statusCode,
		data: data
	};
};